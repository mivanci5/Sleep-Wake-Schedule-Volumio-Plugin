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

  this.clearTimers();

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
      this.setUIConfigValues(uiconf);
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

  this.updateConfig(data);

  this.config.save();
  this.commandRouter.pushToastMessage('success', 'Settings Saved', 'Your settings have been saved.');
  this.writeLog('Settings saved.');

  return libQ.resolve();
};

SleepWakePlugin.prototype.loadConfig = function () {
  this.sleepTime = this.config.get('sleepTime') || '22:00';
  this.wakeTime = this.config.get('wakeTime') || '07:00';
  this.startVolume = parseInt(this.config.get('startVolume'), 10) || 20;
  this.playlist = this.config.get('playlist') || '';

  this.writeLog('Configuration loaded:');
  this.writeLog(`sleepTime: ${this.sleepTime}, wakeTime: ${this.wakeTime}, startVolume: ${this.startVolume}, playlist: ${this.playlist}`);
};

SleepWakePlugin.prototype.scheduleSleep = function () {
  const sleepTime = this.parseTime(this.sleepTime);

  if (!sleepTime) {
    this.handleError('Invalid sleep time. Sleep will not be scheduled.');
    return;
  }

  this.writeLog('Scheduling sleep...');
  this.scheduleTimer('sleepTimer', sleepTime, () => {
    if (this.isWaking) {
      this.writeLog('Skipping sleep as wake-up process is ongoing.');
      return;
    }
    this.fadeOutVolume();
  });
};

SleepWakePlugin.prototype.scheduleWake = function () {
  const wakeTime = this.parseTime(this.wakeTime);

  if (!wakeTime) {
    this.handleError('Invalid wake time. Wake will not be scheduled.');
    return;
  }

  this.writeLog('Scheduling wake...');
  this.scheduleTimer('wakeTimer', wakeTime, () => {
    if (this.isSleeping) {
      this.writeLog('Interrupting sleep to start wake-up.');
      this.clearTimer('sleepTimer');
      this.isSleeping = false;
    }
    this.startPlaylist();
  });
};

SleepWakePlugin.prototype.parseTime = function (timeStr) {
  this.writeLog('Parsing time from string: ' + timeStr);
  let parsedTime;

  if (timeStr.includes('T')) {
    parsedTime = new Date(timeStr);
  } else if (timeStr.includes(':')) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    parsedTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
  } else {
    this.handleError('Unrecognized time format: ' + timeStr);
    return null;
  }

  if (isNaN(parsedTime.getTime())) {
    this.handleError('Failed to parse time from string: ' + timeStr);
    return null;
  }

  if (timeStr.includes('Z')) {
    parsedTime = new Date(parsedTime.getTime() + parsedTime.getTimezoneOffset() * 60000);
  }

  this.writeLog('Parsed time: ' + parsedTime);
  return parsedTime;
};

SleepWakePlugin.prototype.sendRestCommand = function (endpoint, callback) {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: endpoint,
    method: 'GET',
  };

  this.logger.info(`Sending REST command to ${options.hostname}:${options.port}${options.path}`);
  this.writeLog(`Sending REST command to ${options.hostname}:${options.port}${options.path}`);

  const req = http.request(options, (res) => {
    res.setEncoding('utf8');
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    res.on('end', () => {
      this.writeLog(`Received response: ${responseData}`);
      if (callback) {
        callback(null, responseData);
      }
    });
  });

  req.on('error', (e) => {
    this.handleError(`Problem with request: ${e.message}`, e, callback);
  });

  req.end();
};

SleepWakePlugin.prototype.getCurrentVolume = function (callback) {
  this.sendRestCommand('/api/v1/getState', (err, response) => {
    if (err) {
      return callback(err);
    }
    try {
      const data = JSON.parse(response);
      callback(null, parseInt(data.volume, 10));
    } catch (error) {
      this.handleError('Error parsing volume', error, callback);
    }
  });
};

SleepWakePlugin.prototype.fadeOutVolume = function () {
  this.isSleeping = true;
  this.logger.info('SleepWakePlugin - Starting fade out volume');
  this.writeLog('Starting fade out volume');

  this.adjustVolume(-1, 'fadeOutVolume');
};

SleepWakePlugin.prototype.startPlaylist = function () {
  this.isWaking = true;
  this.logger.info('SleepWakePlugin - Starting playlist');
  this.writeLog('Starting playlist');

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
        if (++step < steps) {
          setTimeout(adjust, interval);
        } else {
          this.isSleeping = false;
          this.isWaking = false;
        }
      });
    });
  };
  adjust();
};

SleepWakePlugin.prototype.clearTimers = function () {
  this.clearTimer('sleepTimer');
  this.clearTimer('wakeTimer');
};

SleepWakePlugin.prototype.clearTimer = function (timerName) {
  if (this[timerName]) {
    clearTimeout(this[timerName]);
    this.writeLog(`Cleared ${timerName}.`);
  }
};

SleepWakePlugin.prototype.scheduleTimer = function (timerName, targetTime, action) {
  const now = new Date();
  if (targetTime <= now) targetTime.setDate(targetTime.getDate() + 1);
  const timeUntilAction = targetTime - now;

  this.clearTimer(timerName);
  this.logger.info(`SleepWakePlugin - ${timerName} scheduled in ${timeUntilAction} milliseconds`);
  this.writeLog(`${timerName} scheduled in ${timeUntilAction} milliseconds`);

  this[timerName] = setTimeout(action, timeUntilAction);
};

SleepWakePlugin.prototype.setUIConfigValues = function (uiconf) {
  uiconf.sections[0].content[0].value = this.config.get('sleepTime') || '22:00';
  uiconf.sections[1].content[0].value = this.config.get('wakeTime') || '07:00';
  uiconf.sections[1].content[1].value = this.config.get('startVolume') || 20;
  uiconf.sections[1].content[2].value = this.config.get('playlist') || '';
};

SleepWakePlugin.prototype.updateConfig = function (data) {
  if (data.sleepTime !== undefined) {
    this.config.set('sleepTime', data.sleepTime);
    this.sleepTime = data.sleepTime;
    this.writeLog('Set sleepTime to ' + data.sleepTime);
    this.scheduleSleep();
  }
  if (data.wakeTime !== undefined) {
    this.config.set('wakeTime', data.wakeTime);
    this.wakeTime = data.wakeTime;
    this.writeLog('Set wakeTime to ' + data.wakeTime);
    this.scheduleWake();
  }
  if (data.startVolume !== undefined) {
    const volumeValue = parseInt(data.startVolume, 10);
    if (!isNaN(volumeValue)) {
      this.config.set('startVolume', volumeValue);
      this.startVolume = volumeValue;
      this.writeLog('Set startVolume to ' + volumeValue);
    }
  }
  if (data.playlist !== undefined) {
    this.config.set('playlist', data.playlist);
    this.playlist = data.playlist;
    this.writeLog('Set playlist to ' + data.playlist);
  }
};

SleepWakePlugin.prototype.handleError = function (message, err, defer) {
  this.logger.error(message + (err ? ': ' + err : ''));
  this.writeLog(message + (err ? ': ' + err : ''));
  if (defer) defer.reject(new Error(message));
};

SleepWakePlugin.prototype.getConfigurationFiles = function () {
  return ['config.json'];
};

SleepWakePlugin.prototype.getConf = function (varName) {
  return this.config.get(varName);
};

SleepWakePlugin.prototype.setConf = function (varName, varValue) {
  this.config.set(varName, varValue);
};

SleepWakePlugin.prototype.writeLog = function (message) {
  const logMessage = `[${new Date().toISOString()}] ${message}${os.EOL}`;
  fs.appendFileSync(this.logFile, logMessage, { encoding: 'utf8' });
};
