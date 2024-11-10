'use strict';

const libQ = require('kew');
const fs = require('fs-extra');
const path = require('path');
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

  fs.readJson(path.join(__dirname, 'UIConfig.json'), (err, uiconf) => {
    if (err) {
      this.logger.error('SleepWakePlugin - Error reading UIConfig.json: ' + err);
      this.writeLog('Error reading UIConfig.json: ' + err);
      defer.reject(err);
      return;
    }

    try {
      uiconf.sections[0].content[0].value = this.config.get('sleepTime', '22:00');
      uiconf.sections[1].content[0].value = this.config.get('wakeTime', '07:00');
      uiconf.sections[1].content[1].value = this.config.get('startVolume', 20);
      uiconf.sections[1].content[2].value = this.config.get('playlist', '');

      this.writeLog('UI configuration loaded successfully.');
      defer.resolve(uiconf);
    } catch (parseError) {
      this.logger.error('SleepWakePlugin - Error parsing UIConfig.json: ' + parseError);
      this.writeLog('Error parsing UIConfig.json: ' + parseError);
      defer.reject(parseError);
    }
  });

  return defer.promise;
};

SleepWakePlugin.prototype.saveOptions = function (data) {
  this.logger.info('SleepWakePlugin - saveOptions');
  this.writeLog('Saving options. Data received: ' + JSON.stringify(data));

  // Save and apply settings
  this.config.set('sleepTime', data.sleepTime);
  this.config.set('wakeTime', data.wakeTime);
  this.config.set('startVolume', parseInt(data.startVolume, 10));
  this.config.set('playlist', data.playlist);
  this.config.save();

  clearTimeout(this.sleepTimer);
  clearTimeout(this.wakeTimer);
  this.scheduleSleep();
  this.scheduleWake();

  this.commandRouter.pushToastMessage('success', 'Settings Saved', 'Your settings have been saved.');
  this.logger.info('SleepWakePlugin - Settings saved');
  this.writeLog('Settings saved.');

  return libQ.resolve();
};

SleepWakePlugin.prototype.loadConfig = function () {
  this.sleepTime = this.config.get('sleepTime', '22:00');
  this.wakeTime = this.config.get('wakeTime', '07:00');
  this.startVolume = parseInt(this.config.get('startVolume', 20), 10);
  this.playlist = this.config.get('playlist', '');

  this.writeLog(`Configuration loaded: sleepTime: ${this.sleepTime}, wakeTime: ${this.wakeTime}, startVolume: ${this.startVolume}, playlist: ${this.playlist}`);
};

SleepWakePlugin.prototype.scheduleSleep = function () {
  const sleepTime = this.parseTime(this.sleepTime);
  if (!sleepTime) return;

  const now = new Date();
  if (sleepTime <= now) sleepTime.setDate(sleepTime.getDate() + 1);

  const timeUntilSleep = sleepTime - now;
  clearTimeout(this.sleepTimer);

  this.sleepTimer = setTimeout(() => {
    this.logger.info('SleepWakePlugin - Sleep timer triggered');
    this.writeLog('Sleep timer triggered.');
    this.fadeOutVolume();
  }, timeUntilSleep);
};

SleepWakePlugin.prototype.scheduleWake = function () {
  const wakeTime = this.parseTime(this.wakeTime);
  if (!wakeTime) return;

  const now = new Date();
  if (wakeTime <= now) wakeTime.setDate(wakeTime.getDate() + 1);

  const timeUntilWake = wakeTime - now;
  clearTimeout(this.wakeTimer);

  this.wakeTimer = setTimeout(() => {
    this.logger.info('SleepWakePlugin - Wake timer triggered');
    this.writeLog('Wake timer triggered.');
    this.startPlaylist();
  }, timeUntilWake);
};

SleepWakePlugin.prototype.fadeOutVolume = function () {
  if (this.isWaking) return;
  this.isSleeping = true;

  this.logger.info('SleepWakePlugin - Starting fade out volume');
  this.writeLog('Starting fade out volume');

  this.adjustVolume(-1, () => {
    this.sendRestCommand('/api/v1/commands/?cmd=stop', () => {
      this.isSleeping = false;
    });
  });
};

SleepWakePlugin.prototype.startPlaylist = function () {
  if (this.isSleeping) {
    clearTimeout(this.sleepTimer);
    this.isSleeping = false;
  }
  this.isWaking = true;

  this.logger.info('SleepWakePlugin - Starting playlist');
  this.writeLog('Starting playlist');

  this.sendRestCommand(`/api/v1/commands/?cmd=volume&volume=${this.startVolume}`, () => {
    this.sendRestCommand(`/api/v1/commands/?cmd=playplaylist&name=${encodeURIComponent(this.playlist)}`, () => {
      this.adjustVolume(1, () => {
        this.isWaking = false;
      });
    });
  });
};

SleepWakePlugin.prototype.adjustVolume = function (delta, callback) {
  let step = 0;
  const steps = 10;
  const interval = 2 * 60 * 1000;

  const adjust = () => {
    if (step >= steps) {
      callback();
      return;
    }

    this.getCurrentVolume((err, currentVolume) => {
      if (err) return;
      const newVolume = Math.min(Math.max(currentVolume + delta, 0), 100);
      this.sendRestCommand(`/api/v1/commands/?cmd=volume&volume=${newVolume}`, () => {
        step++;
        setTimeout(adjust, interval);
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

  http.request(options, (res) => {
    res.setEncoding('utf8');
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    res.on('end', () => {
      callback(null, responseData);
    });
  }).on('error', (e) => {
    this.logger.error(`Problem with request: ${e.message}`);
    callback(e);
  }).end();
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

SleepWakePlugin.prototype.parseTime = function (timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
};

SleepWakePlugin.prototype.writeLog = function (message) {
  fs.appendFileSync(this.logFile, `[${new Date().toISOString()}] ${message}${require('os').EOL}`, { encoding: 'utf8' });
};
