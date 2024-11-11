'use strict';

const libQ = require('kew');
const fs = require('fs-extra');
const path = require('path');
const config = new (require('v-conf'))();
const os = require('os');
const http = require('http');

module.exports = SleepWakePlugin;

function SleepWakePlugin(context) {
  this.context = context;
  this.commandRouter = context.coreCommand;
  this.logger = context.logger;
  this.configManager = context.configManager;
  this.logFile = path.join(__dirname, 'sleep-wake-plugin.log');
  this.isSleeping = false;
  this.isWaking = false;
}

SleepWakePlugin.prototype.onVolumioStart = function () {
  this.logger.info('SleepWakePlugin - onVolumioStart');
  this.writeLog('Plugin starting...');

  const configFile = this.commandRouter.pluginManager.getConfigurationFile(this.context, 'config.json');
  this.config = new (require('v-conf'))();
  this.config.loadFile(configFile);

  return libQ.resolve();
};

SleepWakePlugin.prototype.onStart = function () {
  this.logger.info('SleepWakePlugin - onStart');
  this.writeLog('Plugin started.');

  this.loadConfig();
  this.scheduleSleep();
  this.scheduleWake();

  return libQ.resolve();
};

SleepWakePlugin.prototype.onStop = function () {
  this.logger.info('SleepWakePlugin - onStop');
  this.writeLog('Plugin stopped.');

  // Clear timers
  clearTimeout(this.sleepTimer);
  clearTimeout(this.wakeTimer);

  // Reset state flags
  this.isSleeping = false;
  this.isWaking = false;

  return libQ.resolve();
};

SleepWakePlugin.prototype.getUIConfig = function () {
  const defer = libQ.defer();

  this.logger.info('SleepWakePlugin - getUIConfig');
  this.writeLog('Loading UI configuration.');

  this.loadConfig();
  const uiconfPath = path.join(__dirname, 'UIConfig.json');

  fs.readJson(uiconfPath, (err, uiconf) => {
    if (err) {
      this.handleError('Error reading UIConfig.json', err, defer);
      return;
    }

    try {
      uiconf.sections[0].content[0].value = this.config.get('sleepTime');
      uiconf.sections[1].content[0].value = this.config.get('wakeTime');
      uiconf.sections[1].content[1].value = this.config.get('startVolume');
      uiconf.sections[1].content[2].value = this.config.get('playlist');

      this.writeLog('UI configuration loaded successfully.');
      defer.resolve(uiconf);
    } catch (parseError) {
      this.handleError('Error parsing UIConfig.json', parseError, defer);
    }
  });

  return defer.promise;
};

SleepWakePlugin.prototype.saveOptions = function (data) {
  this.logger.info('SleepWakePlugin - saveOptions');
  this.writeLog('Saving options. Data received: ' + JSON.stringify(data));

  // Save sleep settings
  if (data.sleepTime !== undefined) {
    this.config.set('sleepTime', data.sleepTime);
    this.writeLog('Set sleepTime to ' + data.sleepTime);
    this.scheduleSleep();
  }

  // Save wake settings
  if (data.wakeTime !== undefined) this.config.set('wakeTime', data.wakeTime);
  if (data.startVolume !== undefined) this.config.set('startVolume', parseInt(data.startVolume, 10));
  if (data.playlist !== undefined) this.config.set('playlist', data.playlist);
  this.writeLog('Wake settings updated.');
  this.scheduleWake();

  this.config.save();
  this.commandRouter.pushToastMessage('success', 'Settings Saved', 'Your settings have been saved.');
  this.writeLog('Settings saved.');

  return libQ.resolve();
};

SleepWakePlugin.prototype.loadConfig = function () {
  this.sleepTime = this.config.get('sleepTime');
  this.wakeTime = this.config.get('wakeTime');
  this.startVolume = parseInt(this.config.get('startVolume'), 10);
  this.playlist = this.config.get('playlist');

  this.writeLog('Configuration loaded:');
  this.writeLog(`sleepTime: ${this.sleepTime}, wakeTime: ${this.wakeTime}, startVolume: ${this.startVolume}, playlist: ${this.playlist}`);
};

SleepWakePlugin.prototype.scheduleSleep = function () {
  const sleepTime = this.parseTime(this.sleepTime);
  if (!sleepTime) return;

  const now = new Date();
  if (sleepTime <= now) sleepTime.setDate(sleepTime.getDate() + 1);
  const timeUntilSleep = sleepTime - now;

  clearTimeout(this.sleepTimer);
  this.sleepTimer = setTimeout(() => this.fadeOutVolume(), timeUntilSleep);
  this.writeLog(`Sleep scheduled in ${timeUntilSleep} milliseconds`);
};

SleepWakePlugin.prototype.scheduleWake = function () {
  const wakeTime = this.parseTime(this.wakeTime);
  if (!wakeTime) return;

  const now = new Date();
  if (wakeTime <= now) wakeTime.setDate(wakeTime.getDate() + 1);
  const timeUntilWake = wakeTime - now;

  clearTimeout(this.wakeTimer);
  this.wakeTimer = setTimeout(() => this.startPlaylist(), timeUntilWake);
  this.writeLog(`Wake scheduled in ${timeUntilWake} milliseconds`);
};

SleepWakePlugin.prototype.parseTime = function (timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) {
    this.writeLog('Invalid time format: ' + timeStr);
    return null;
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
};

SleepWakePlugin.prototype.fadeOutVolume = function () {
  if (this.isWaking) return;
  this.isSleeping = true;
  this.adjustVolume(-1, 'fadeOutVolume');
};

SleepWakePlugin.prototype.startPlaylist = function () {
  if (this.isSleeping) {
    clearTimeout(this.sleepTimer);
    this.isSleeping = false;
  }
  this.isWaking = true;
  this.sendRestCommand(`/api/v1/commands/?cmd=volume&volume=${this.startVolume}`, () => {
    this.sendRestCommand(`/api/v1/commands/?cmd=playplaylist&name=${encodeURIComponent(this.playlist)}`, () => {
      this.adjustVolume(1, 'startPlaylist');
    });
  });
};

SleepWakePlugin.prototype.adjustVolume = function (stepChange, caller) {
  const steps = 10;
  const interval = 2 * 60 * 1000;
  let step = 0;

  const adjust = () => {
    this.getCurrentVolume((err, currentVolume) => {
      if (err) {
        this.handleError(`Error getting current volume in ${caller}`, err);
        return;
      }
      const newVolume = Math.max(0, Math.min(currentVolume + stepChange, 100));
      this.sendRestCommand(`/api/v1/commands/?cmd=volume&volume=${newVolume}`, () => {
        if (++step < steps) setTimeout(adjust, interval);
        else {
          this.isSleeping = false;
          this.isWaking = false;
        }
      });
    });
  };
  adjust();
};

SleepWakePlugin.prototype.sendRestCommand = function (endpoint, callback) {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: endpoint,
    method: 'GET',
  };

  const req = http.request(options, (res) => {
    let responseData = '';
    res.on('data', (chunk) => (responseData += chunk));
    res.on('end', () => callback && callback(null, responseData));
  });

  req.on('error', (e) => this.handleError('Problem with request: ', e));
  req.end();
};

SleepWakePlugin.prototype.getCurrentVolume = function (callback) {
  this.sendRestCommand('/api/v1/getState', (err, response) => {
    if (err) return callback(err);
    try {
      const data = JSON.parse(response);
      callback(null, parseInt(data.volume, 10));
    } catch (error) {
      callback(error);
    }
  });
};

SleepWakePlugin.prototype.handleError = function (message, err, defer) {
  this.logger.error(message + ': ' + err);
  this.writeLog(message + ': ' + err);
  if (defer) defer.reject(new Error());
};

SleepWakePlugin.prototype.writeLog = function (message) {
  const logMessage = `[${new Date().toISOString()}] ${message}${os.EOL}`;
  fs.appendFileSync(this.logFile, logMessage, { encoding: 'utf8' });
};
