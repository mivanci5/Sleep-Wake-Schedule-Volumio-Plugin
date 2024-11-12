
Volumio Sleep-Wake Schedule Plugin
Overview
The Volumio Sleep-Wake Schedule Plugin is designed to enhance your Volumio experience by adding sleep and wake-up automation features. This plugin allows you to schedule when Volumio should fade out the volume and stop playback at night and when it should gradually increase the volume and start a specific playlist in the morning.

Features
Sleep Mode: Automatically fades out the volume and stops playback at a specified time.
Wake Mode: Gradually increases the volume and starts a playlist at a set wake-up time.
Configurable Volume Levels: Set the desired volume level for wake-up.
Flexible Scheduling: Define sleep and wake times to fit your routine.
Easy Configuration: Intuitive UI for setting sleep and wake parameters.
Installation
To install the plugin, follow these steps:

Clone the repository:
bash:

git clone https://github.com/mivanci5/sleep-wake-schedule-volumio-plugin.git

volumio plugin install


Enable the plugin via the Volumio web interface.

Configuration
Once the plugin is installed, you can access its settings in the Volumio web UI:

Go to Settings > Plugins > System Controller.
Select Sleep-Wake Schedule Plugin.
Set the desired Sleep Time, Wake Time, Start Volume, and Playlist.
Configuration Options
Sleep Time: The time at which Volumio will fade out and stop playback.
Wake Time: The time at which Volumio will wake up, gradually increase volume, and play a specified playlist.
Start Volume: The initial volume level to start with during wake-up.
Playlist: The name of the playlist to start playing upon waking up.
Usage
The plugin schedules sleep and wake tasks based on the settings provided. The sleep functionality will gradually reduce the volume to zero before stopping playback, while the wake function will increase the volume step-by-step and start a selected playlist.

Example
Sleep Time: 22:00 — Volumio will fade out at 10 PM.
Wake Time: 07:00 — Volumio will start increasing volume at 7 AM and play your morning playlist.
Start Volume: 35 — The wake-up volume level.
Playlist: Morning Vibes — The playlist that starts playing during wake-up.
Logs and Debugging
The plugin generates logs to help with troubleshooting:

bash
Copy code
tail -f /data/plugins/system_controller/sleep-wake-schedule-volumio-plugin/sleep-wake-plugin.log
Contributing
Contributions are welcome! Please fork the repository and submit a pull request with any improvements or bug fixes.

License
This project is licensed under the MIT License. See the LICENSE file for details.

