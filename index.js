'use strict';

const libQ = require('kew');
const fs = require('fs-extra');
const path = require('path');
const config = new (require('v-conf'))();
const os = require('os');
const http = require('http');

module.exports = SleepWakePlugin;

function SleepWakePlugin(context) {
  const self = this;

  self.context = context;
  self.commandRouter = self.context.coreCommand;
  self.logger = self.context.logger;
  self.configManager = self.context.configManager;

  // Path to the log file
  self.logFile = path.join(__dirname, 'sleep-wake-plugin.log');

  // State flags
  self.isSleeping = false;
  self.isWaking = false;
}

SleepWakePlugin.prototype.onVolumioStart = function () {
  const self = this;

  self.logger.info('SleepWakePlugin - onVolumioStart');
  self.writeLog('Plugin starting...');

  const configFile = self.commandRouter.pluginManager.getConfigurationFile(self.context, 'config.json');
  self.config = new (require('v-conf'))();
  self.config.loadFile(configFile);

  return libQ.resolve();
};

SleepWakePlugin.prototype.onStart = function () {
  self.writeLog('Function onStart');
  const self = this;
  const defer = libQ.defer();

  self.logger.info('SleepWakePlugin - onStart');
  self.writeLog('Plugin started.');

  self.loadConfig();
  self.scheduleSleep();
  self.scheduleWake();

  defer.resolve();
  return defer.promise;
};

SleepWakePlugin.prototype.onStop = function () {
  self.writeLog('Function onStop');
  const self = this;
  const defer = libQ.defer();

  self.logger.info('SleepWakePlugin - onStop');
  self.writeLog('Plugin stopped.');

  // Clear timers
  if (self.sleepTimer) {
    clearTimeout(self.sleepTimer);
    self.writeLog('Cleared sleep timer.');
  }
  if (self.wakeTimer) {
    clearTimeout(self.wakeTimer);
    self.writeLog('Cleared wake timer.');
  }

  // Reset state flags
  self.isSleeping = false;
  self.isWaking = false;

  defer.resolve();
  return defer.promise;
};

SleepWakePlugin.prototype.getUIConfig = function () {
 
  const self = this;
  const defer = libQ.defer();

  self.logger.info('SleepWakePlugin - getUIConfig');
  self.writeLog('Loading UI configuration.');

  self.loadConfig();
  const uiconfPath = path.join(__dirname, 'UIConfig.json');

  fs.readJson(uiconfPath, function (err, uiconf) {
    if (err) {
      self.logger.error('SleepWakePlugin - Error reading UIConfig.json: ' + err);
      self.writeLog('Error reading UIConfig.json: ' + err);
      defer.reject(new Error());
      return;
    }

    try {
      uiconf.sections[0].content[0].value = self.config.get('sleepTime') || '22:00';
      uiconf.sections[0].content[1].value = self.config.get('volumeDecrease') || 1;
      uiconf.sections[0].content[2].value = self.config.get('minutesFade') || 10;

      uiconf.sections[1].content[0].value = self.config.get('wakeTime') || '07:00';
      uiconf.sections[1].content[1].value = self.config.get('startVolume') || 20;
      uiconf.sections[1].content[2].value = self.config.get('playlist') || '';
      uiconf.sections[1].content[3].value = self.config.get('volumeIncrease') || 1;
      uiconf.sections[1].content[4].value = self.config.get('minutesRamp') || 10;

      self.writeLog('UI configuration loaded successfully.');
      defer.resolve(uiconf);
    } catch (parseError) {
      self.logger.error('SleepWakePlugin - Error parsing UIConfig.json: ' + parseError);
      self.writeLog('Error parsing UIConfig.json: ' + parseError);
      defer.reject(new Error());
    }
  });

  return defer.promise;
};

SleepWakePlugin.prototype.saveOptions = function (data) {
  self.writeLog('Function saveOptions');
  const self = this;

  self.logger.info('SleepWakePlugin - saveOptions');
  self.writeLog('Saving options. Data received: ' + JSON.stringify(data));

  // Extract values from data
  const sleepTime = data['sleepTime'];
  const wakeTime = data['wakeTime'];
  const startVolume = data['startVolume'];
  const playlist = data['playlist'];
  const volumeDecrease = data['volumeDecrease'];
  const minutesFade = data['minutesFade'];
  const volumeIncrease = data['volumeIncrease'];
  const minutesRamp = data['minutesRamp'];

  // Save sleep settings
  self.writeLog('Saving sleep setings');
  
  if (sleepTime !== undefined) {
    self.config.set('data default = sleepTime', sleepTime);
    self.sleepTime = sleepTime;
    self.writeLog('Set sleepTime to ' + sleepTime);
    if (self.sleepTimer) {
      clearTimeout(self.sleepTimer);
      self.writeLog('Cleared existing sleep timer.');
    }
    self.scheduleSleep();
  }

  if (volumeDecrease !== undefined) {
    self.config.set('data default = volumeDecrease', volumeDecrease);
    self.volumeDecrease = volumeDecrease;
    self.writeLog('Set volumeDecrease to ' + volumeDecrease);
  }

  if (minutesFade !== undefined) {
    self.config.set('data default = minutesFade', minutesFade);
    self.minutesFade = minutesFade;
    self.writeLog('Set minutesFade to ' + minutesFade);
  }

  // Save wake settings
  self.writeLog('Save wake settings');
  
  if (wakeTime !== undefined || startVolume !== undefined || playlist !== undefined || volumeIncrease !== undefined || minutesRamp !== undefined) {
    if (wakeTime !== undefined) {
      self.config.set('data default = wakeTime', wakeTime);
      self.wakeTime = wakeTime;
      self.writeLog('data default = Set wakeTime to ' + wakeTime);
    }
    if (startVolume !== undefined) {
      const volumeValue = parseInt(startVolume, 10);
      if (isNaN(volumeValue)) {
        self.logger.error('SleepWakePlugin - Invalid startVolume value: ' + JSON.stringify(startVolume));
        self.writeLog('Invalid startVolume value: ' + JSON.stringify(startVolume));
      } else {
        self.config.set('startVolume', volumeValue);
        self.startVolume = volumeValue;
        self.writeLog('Set startVolume to ' + volumeValue);
      }
    }
    if (playlist !== undefined) {
      self.config.set('playlist', playlist);
      self.playlist = playlist;
      self.writeLog('Set playlist to ' + playlist);
    }
    if (volumeIncrease !== undefined) {
      self.config.set('volumeIncrease', volumeIncrease);
      self.volumeIncrease = volumeIncrease;
      self.writeLog('Set volumeIncrease to ' + volumeIncrease);
    }
    if (minutesRamp !== undefined) {
      self.config.set('minutesRamp', minutesRamp);
      self.minutesRamp = minutesRamp;
      self.writeLog('Set minutesRamp to ' + minutesRamp);
    }
    if (self.wakeTimer) {
      clearTimeout(self.wakeTimer);
      self.writeLog('Cleared existing wake timer.');
    }
    self.scheduleWake();
  }

  // Save configuration to disk
  self.writeLog('Save configuration on disk');
  
  self.config.save();
  self.writeLog('Configuration saved.');

  self.commandRouter.pushToastMessage('success', 'Settings Saved', 'Your settings have been saved.');

  self.logger.info('SleepWakePlugin - Settings saved');
  self.writeLog('Settings saved.');

  return libQ.resolve();
};

SleepWakePlugin.prototype.loadConfig = function () {
  self.writeLog('Function loadConfig');
  const self = this;

  self.sleepTime = self.config.get('sleepTime') || '22:00';
  self.wakeTime = self.config.get('wakeTime') || '07:00';
  self.startVolume = parseInt(self.config.get('startVolume'), 10) || 20;
  self.playlist = self.config.get('playlist') || '';
  self.volumeDecrease = parseInt(self.config.get('volumeDecrease'), 10) || 1;
  self.minutesFade = parseInt(self.config.get('minutesFade'), 10) || 10;
  self.volumeIncrease = parseInt(self.config.get('volumeIncrease'), 10) || 1;
  self.minutesRamp = parseInt(self.config.get('minutesRamp'), 10) || 10;

  self.writeLog('Configuration loaded:');
  self.writeLog('sleepTime: ' + self.sleepTime);
  self.writeLog('wakeTime: ' + self.wakeTime);
  self.writeLog('startVolume: ' + self.startVolume);
  self.writeLog('playlist: ' + self.playlist);
  self.writeLog('volumeDecrease: ' + self.volumeDecrease);
  self.writeLog('minutesFade: ' + self.minutesFade);
  self.writeLog('volumeIncrease: ' + self.volumeIncrease);
  self.writeLog('minutesRamp: ' + self.minutesRamp);
};

SleepWakePlugin.prototype.scheduleSleep = function () {
  self.writeLog('Function scheduleSleep');
  const self = this;

  const now = new Date();
  const sleepTime = self.parseTime(self.sleepTime);

  if (!sleepTime) {
    self.logger.error('SleepWakePlugin - Invalid sleep time. Sleep will not be scheduled.');
    self.writeLog('Invalid sleep time. Sleep will not be scheduled.');
    return;
  }

  self.writeLog('Scheduling sleep...');
  self.writeLog('Current time: ' + now);
  self.writeLog('Sleep time: ' + sleepTime);

  // If sleepTime is before now, add one day
  if (sleepTime <= now) sleepTime.setDate(sleepTime.getDate() + 1);

  // Calculate the time until sleep starts (in milliseconds)
  let timeUntilSleep = sleepTime - now;

  if (self.sleepTimer) {
    clearTimeout(self.sleepTimer);
    self.writeLog('Cleared existing sleep timer.');
  }

  self.logger.info('SleepWakePlugin - Sleep scheduled in ' + timeUntilSleep + ' milliseconds');
  self.writeLog('Sleep scheduled in ' + timeUntilSleep + ' milliseconds');

  self.sleepTimer = setTimeout(function () {
    self.logger.info('SleepWakePlugin - Sleep timer triggered');
    self.writeLog('Sleep timer triggered.');
    self.fadeOutVolume();
  }, timeUntilSleep);
};

SleepWakePlugin.prototype.scheduleWake = function () {
  self.writeLog('Function scheduleWake');
  const self = this;

  const now = new Date();
  const wakeTime = self.parseTime(self.wakeTime);

  if (!wakeTime) {
    self.logger.error('SleepWakePlugin - Invalid wake time. Wake will not be scheduled.');
    self.writeLog('Invalid wake time. Wake will not be scheduled.');
    return;
  }

  self.writeLog('Scheduling wake...');
  self.writeLog('Current time: ' + now);
  self.writeLog('Wake time: ' + wakeTime);

  // If wakeTime is before now, add one day
  if (wakeTime <= now) wakeTime.setDate(wakeTime.getDate() + 1);

  // Calculate the time until wake starts (in milliseconds)
  let timeUntilWake = wakeTime - now;

  if (self.wakeTimer) {
    clearTimeout(self.wakeTimer);
    self.writeLog('Cleared existing wake timer.');
  }

  self.logger.info('SleepWakePlugin - Wake scheduled in ' + timeUntilWake + ' milliseconds');
  self.writeLog('Wake scheduled in ' + timeUntilWake + ' milliseconds');

  self.wakeTimer = setTimeout(function () {
    self.logger.info('SleepWakePlugin - Wake timer triggered');
    self.writeLog('Wake timer triggered.');
    self.startPlaylist();
  }, timeUntilWake);
};

SleepWakePlugin.prototype.parseTime = function (timeStr) {
 
  const self = this;
  self.writeLog('Parsing time from string: ' + timeStr);
  let parsedTime;

  // Try parsing the time string
  if (timeStr.includes('T')) {
    // Handle ISO date string
    parsedTime = new Date(timeStr);
  } else if (timeStr.includes(':')) {
    // Handle "HH:MM" format
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    parsedTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
  } else {
    self.writeLog('Unrecognized time format: ' + timeStr);
    return null;
  }

  if (isNaN(parsedTime.getTime())) {
    self.writeLog('Failed to parse time from string: ' + timeStr);
    return null;
  }

  // Adjust for time zone if necessary
  if (timeStr.includes('Z')) {
    // If the time string is in UTC (contains 'Z'), adjust to local time
    parsedTime = new Date(parsedTime.getTime() + parsedTime.getTimezoneOffset() * 60000);
  }

  self.writeLog('Parsed time: ' + parsedTime);
  return parsedTime;
};

SleepWakePlugin.prototype.sendRestCommand = function (endpoint, callback) {
  self.writeLog('Function sendRestCommand');
  const self = this;
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: endpoint,
    method: 'GET',
  };

  self.logger.info(`Sending REST command to ${options.hostname}:${options.port}${options.path}`);
  self.writeLog(`Sending REST command to ${options.hostname}:${options.port}${options.path}`);

  const req = http.request(options, (res) => {
    res.setEncoding('utf8');
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    res.on('end', () => {
      self.logger.info(`Received response: ${responseData}`);
      self.writeLog(`Received response: ${responseData}`);
      if (callback) {
        callback(null, responseData);
      }
    });
  });

  req.on('error', (e) => {
    self.logger.error(`Problem with request: ${e.message}`);
    self.writeLog(`Problem with request: ${e.message}`);
    if (callback) {
      callback(e);
    }
  });

  req.end();
};

SleepWakePlugin.prototype.getCurrentVolume = function (callback) {
self.writeLog('Function getCurrentVolume');
  const self = this;
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/getState',
    method: 'GET',
  };

  self.logger.info('Getting current volume');
  self.writeLog('Getting current volume');

  const req = http.request(options, (res) => {
    res.setEncoding('utf8');
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    res.on('end', () => {
      try {
        const data = JSON.parse(responseData);
        const currentVolume = parseInt(data.volume, 10);
        self.logger.info(`Current volume is ${currentVolume}`);
        self.writeLog(`Current volume is ${currentVolume}`);
        callback(null, currentVolume);
      } catch (error) {
        self.logger.error('Error parsing volume: ' + error);
        self.writeLog('Error parsing volume: ' + error);
        callback(error);
      }
    });
  });

  req.on('error', (e) => {
    self.logger.error(`Problem with request: ${e.message}`);
    self.writeLog(`Problem with request: ${e.message}`);
    callback(e);
  });

  req.end();
};

SleepWakePlugin.prototype.fadeOutVolume = function () {

  const self = this;

  // If already waking up, do not proceed with sleep
  if (self.isWaking) {
    self.logger.warn('SleepWakePlugin - Cannot start sleep during wake-up process.');
    self.writeLog('Cannot start sleep during wake-up process.');
    return;
  }

  self.isSleeping = true;

  self.logger.info('SleepWakePlugin - Starting fade out volume');
  self.writeLog('Starting fade out volume');

  // const steps = 10; // Total number of volume decrease steps
  // const interval = 2 * 60 * 1000; // 2 minutes in milliseconds
  // let step = 0;
  
  const steps = Math.ceil(self.minutesRamp * 60 * 1000 / (self.volumeIncrease * 1000)); // dodano za proracun koraka po korisniku
  const interval = (self.minutesRamp * 60 * 1000) / steps; //pretvoreno u milisekunde
  let step = 0;

  function decreaseVolume() {
    try {
      if (step >= steps) {
        self.logger.info('SleepWakePlugin - Fade out complete. Stopping playback.');
        self.writeLog('Fade out complete. Stopping playback.');

        // Stop playback
        self.sendRestCommand('/api/v1/commands/?cmd=stop', function (err, response) {
          if (err) {
            self.logger.error('Error stopping playback: ' + err);
            self.writeLog('Error stopping playback: ' + err);
          } else {
            self.logger.info('Playback stopped.');
            self.writeLog('Playback stopped.');
          }
        });

        self.isSleeping = false;
        return;
      }

      self.getCurrentVolume(function (err, currentVolume) {
        if (err) {
          self.logger.error('Error getting current volume: ' + err);
          self.writeLog('Error getting current volume: ' + err);
          return;
        }

        const newVolume = Math.max(currentVolume - 1, 0); // Ensure volume doesn't go below 0

        self.logger.info(`Decreasing volume by 1: setting volume to ${newVolume}`);
        self.writeLog(`Decreasing volume by 1: setting volume to ${newVolume}`);

        // Set the new volume
        self.sendRestCommand(`/api/v1/commands/?cmd=volume&volume=${newVolume}`, function (err, response) {
          if (err) {
            self.logger.error('Error setting volume: ' + err);
            self.writeLog('Error setting volume: ' + err);
          } else {
            self.logger.info(`Volume set to ${newVolume}`);
            self.writeLog(`Volume set to ${newVolume}`);
          }

          step++;
          setTimeout(decreaseVolume, interval);
        });
      });
    } catch (error) {
      self.logger.error('SleepWakePlugin - Error in decreaseVolume: ' + error);
      self.writeLog('Error in decreaseVolume: ' + error);
      self.isSleeping = false;
    }
  }

  // Start the volume decrease process
  decreaseVolume();
};

SleepWakePlugin.prototype.startPlaylist = function () {
  self.writeLog('Function startPlaylist');
  const self = this;

  // If already sleeping, interrupt sleep
  if (self.isSleeping) {
    self.logger.info('SleepWakePlugin - Interrupting sleep to start wake-up.');
    self.writeLog('Interrupting sleep to start wake-up.');

    // Clear sleep timers
    if (self.sleepTimer) {
      clearTimeout(self.sleepTimer);
      self.writeLog('Cleared sleep timer.');
    }
    self.isSleeping = false;
  }

  self.isWaking = true;

  self.logger.info('SleepWakePlugin - Starting playlist');
  self.writeLog('Starting playlist');

  //const steps = 10; // Total number of volume increase steps
  //const interval = 2 * 60 * 1000; // 2 minutes in milliseconds
  //let step = 0;

  const steps = Math.ceil(self.minutesRamp * 60 * 1000 / (self.volumeIncrease * 1000)); // dodano za proracun koraka po korisniku
  const interval = (self.minutesRamp * 60 * 1000) / steps; //pretvoreno u milisekunde
  let step = 0;
  
  // Set initial volume
  self.sendRestCommand(`/api/v1/commands/?cmd=volume&volume=${self.startVolume}`, function (err, response) {
    if (err) {
      self.logger.error('Error setting initial volume: ' + err);
      self.writeLog('Error setting initial volume: ' + err);
    } else {
      self.logger.info(`Initial volume set to ${self.startVolume}`);
      self.writeLog(`Initial volume set to ${self.startVolume}`);

      // Start the playlist after setting the volume
      self.sendRestCommand(`/api/v1/commands/?cmd=playplaylist&name=${encodeURIComponent(self.playlist)}`, function (err, response) {
        if (err) {
          self.logger.error('Error starting playlist: ' + err);
          self.writeLog('Error starting playlist: ' + err);
        } else {
          self.logger.info(`Playlist "${self.playlist}" started.`);
          self.writeLog(`Playlist "${self.playlist}" started.`);

          // Start increasing volume
          increaseVolume();
        }
      });
    }
  });

  function increaseVolume() {
    try {
      if (step >= steps) {
        self.logger.info('SleepWakePlugin - Volume increase complete.');
        self.writeLog('Volume increase complete.');
        self.isWaking = false;
        return;
      }

      self.getCurrentVolume(function (err, currentVolume) {
        if (err) {
          self.logger.error('Error getting current volume: ' + err);
          self.writeLog('Error getting current volume: ' + err);
          return;
        }

        const newVolume = Math.min(currentVolume + 1, 100); // Ensure volume doesn't exceed 100

        self.logger.info(`Increasing volume by 1: setting volume to ${newVolume}`);
        self.writeLog(`Increasing volume by 1: setting volume to ${newVolume}`);

        // Set the new volume
        self.sendRestCommand(`/api/v1/commands/?cmd=volume&volume=${newVolume}`, function (err, response) {
          if (err) {
            self.logger.error('Error setting volume: ' + err);
            self.writeLog('Error setting volume: ' + err);
          } else {
            self.logger.info(`Volume set to ${newVolume}`);
            self.writeLog(`Volume set to ${newVolume}`);
          }

          step++;
          setTimeout(increaseVolume, interval);
        });
      });
    } catch (error) {
      self.logger.error('SleepWakePlugin - Error in increaseVolume: ' + error);
      self.writeLog('Error in increaseVolume: ' + error);
      self.isWaking = false;
    }
  }
};

SleepWakePlugin.prototype.getConfigurationFiles = function () {
  return ['config.json'];
};

SleepWakePlugin.prototype.getConf = function (varName) {
  const self = this;
  return self.config.get(varName);
};

SleepWakePlugin.prototype.setConf = function (varName, varValue) {
  const self = this;
  self.config.set(varName, varValue);
};

// Custom method to write logs to a file
SleepWakePlugin.prototype.writeLog = function (message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}${os.EOL}`;
  fs.appendFileSync(this.logFile, logMessage, { encoding: 'utf8' });
};
