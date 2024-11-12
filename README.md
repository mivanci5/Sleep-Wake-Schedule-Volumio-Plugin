Description

The Sleep-Wake Schedule Plugin for Volumio allows users to automate the system's playback behavior, such as volume fading and music playback, during predefined sleep and wake-up times. This plugin is perfect for those who want to schedule their music playback experience around bedtime and morning routines.


______________________________________________________________________________________
Key Features:

Gradually fade the volume out when it's time for sleep.

Gradually ramp the volume up and start a specific playlist when waking up.

Customizable settings for how much the volume should increase or decrease during wake-up or sleep.

User-friendly UI configuration to manage all settings from Volumio's interface.


_____________________________________________________________________________________
Installation Instructions

Follow these steps to install the Sleep-Wake Schedule Plugin for Volumio:

*Clone the Repository:*    git clone https://github.com/mivanci5/Sleep-Wake-Schedule-Volumio-Plugin.git

Navigate to the directory where you want to clone the repository and execute the above command.

*Navigate to the Plugin Directory:*    cd Sleep-Wake-Schedule-Volumio-Plugin

*Install pugin with comand:*   volumio plugin install

*Enable Plugin*

Go to the Volumio web UI.

Navigate to Plugins.

Find the Sleep-Wake Schedule Plugin under System.

Click Enable.

if problem with  starting or saving settings restart volumio
*restart command:* volumio vrestart

__________________________________________________________________________________
Configuration Instructions

Once the plugin is enabled, you can configure the sleep and wake-up schedules from Volumio's user interface:

Access Plugin Settings:

In the Volumio web UI, navigate to Settings > Plugins > System > Sleep-Wake Schedule Plugin.

Sleep and Wake Settings:

Sleep Settings: Set the time for the system to enter sleep mode (e.g., fade volume for 10% and stop playback).

Wake Settings: Configure the wake-up time, start volume, playlist, and how quickly the volume should increase.


_________________________________________________________________________________
Usage Example

Set Sleep Time to 22:30, with a gradual volume decrease over 15 minutes.

Configure Wake Time to 07:00, starting at volume level 20, and play your favorite morning playlist. While volume inceises for 20min.


_________________________________________________________________________________
Troubleshooting

Settings Not Saved: If the settings don't appear to save, ensure you have clicked the Save button after making changes. You may need to restart Volumio for changes to take effect.

Logs: Check the plugin log file (sleep-wake-plugin.log) located in the plugin's directory for detailed information regarding the plugin's operation. The plugin logs events such as saving settings, scheduled sleep/wake operations, and errors.


_________________________________________________________________________________
License

This plugin is released under the MIT License.


_________________________________________________________________________________
Contributions

Contributions are welcome! If you find a bug or have a feature request, feel free to open an issue or submit a pull request.


_________________________________________________________________________________
Support

If you have any questions or need support, please open an issue on the GitHub repository.
