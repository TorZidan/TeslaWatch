# Tesla Solar Watch

We hope that you already read the [README file in the parent folder](../README.md), and you are familiar with this project.

## First time setup

The first time setup may be intimidating for the Apps Script novice, but you can do it, thanks to my detailed instructs below. Read on.

Before we start, a note on online safety, grants, permissions, autorizations: Below, you will setup my code to run as "you": the code will write to a spreadsheet that you create and will send emails to recipients of your choice (and the email sender will be you).
I want to ease your mind and say that this code is open sourced, clean, simple, straightforward and well documented. It does not pose any risk to your files or emails or anything else in your Google account because:
- it only sends emails (one or zero emails per run).
- it creates a new tab (you may call it "sheet) in a Spreadsheet that you own, the first time the code is run.
- it inserts a record in that tab each time the code runs.

But there is more: below you'll find instructions on how to generate a "refresh token" for your Tesla account. You will use a third-party tool for that (a chrome extension).
That extension *does have* access to the Tesla password that you type-in at Tesla.com, but it can send it only to Tesla's servers, hence I *think* it's safe; I do use that extension.
You will be storing this "refresh token" in the code (and it will use to gain access to your data). Note that anyone else with this token can access the data in your Tesla account. Do not share your Apps Script project with others, to keep this token safe. 

If you have the slightest doubt about doing any of this, stop here. As the license file explains, you are using my code at your own risk.

Still here? Good. Follow these steps for first-time setup:

1. Go to the Apps Script home page at https://script.google.com/home and make sure you are signed-in with your Google account.

2. Click on the "+ New Project" in the upper left and create it. Choose a relevant name, e.g. "My Tesla Solar Watch". Now you are working with that project.

3. In the vertical panel on the left click on "Editor", then under "Files" click on "+" and add a new "script" file named "Settings" (it will create a file named Settings.gs).

4. Copy/paste the code from https://raw.githubusercontent.com/TorZidan/TeslaWatch/main/TeslaSolarWatch/Settings.gs to replace the content of file Settings.gs.

5. Under "Files" click on "+" again and one mre new "script" file named "TeslaSolarWatch" (it will create a file named TeslaSolarWatch.gs).

6. Copy/paste the code from https://raw.githubusercontent.com/TorZidan/TeslaWatch/main/TeslaSolarWatch/TeslaSolarWatch.gs to replace the content of file TeslaSolarWatch.gs.

7. Now let's setup things in file Settings.gs. In "Editor" mode, click on this file in the "Files" panel to open it for edit and then:
   - Go to https://drive.google.com/drive/home and create a new Spreadsheet. Rename it to e.g. "My Tesla Solar Watch" (the name could be anything).
     The script will use this spreadsheet to keep historical data.
     Copy/paste the spreadsheet url from the browser tab inside the double-quotes at `TESLA_SOLAR_WATCH_SPREADSHEET_URL = ""`
   - Follow the [steps below for getting a Tesla refresh_token](#getting-a-new-tesla-refresh-token); copy/paste the long gibberish string inside the double-quotes at `REFRESH_TOKEN=""` . Do not attempt to split the string into shorter lines, as this will break things.
   - at `EMAIL_RECEPIENTS=""` , enter one or more email recipients of the alert emails.
   - opttionally, you may adjust the line `DAILY_SOLAR_GENERATION_ALERT_THRESHOLD_WATTS = 100;` to enter a higher or lower value.

8. We should be ready to run this for a first time! Select file `TeslaSolarWatch.ts`. Make sure that next to the `Run` and `Debug` buttons you have chosen the function `main`; this is the function thst will be run. Click on "Run".
   You will get a popup window "Authorization required". In it, click on button "Review Permissions".
   Another window pops up where it asks you to choose a Google account. Chose the account you are already logged-in with.
   A red exclamation triange with the text "Google hasn’t verified this app" appears. Click on "Advanced", then click on the text link "Go to TeslaSolarWatch (unsafe)".
   Another window "TeslaSolarWatch wants to access your Google Account" pops up asking you to review the permissions for this script. Click on "Allow". The popup window will close and te script will run.
   If all is good, it should finish successfully and show "Execution completed" at the bottom of the page.
   Go to the Spreadsheet that you created in the step above and observe that it contains a new tab with data from this run (one header row and one row with data).
   Luckily, you don't need to repeat any of these steps at subsequent runs. Try it.

9. In the vertical panel on the left click on "Triggers" and follow the instructions to setup a daily run at e.g. 1 AM each day (in your local time), and set it up to run the `main` function.
   Also, under "Failure notification settings" make sure to choose "Notify me immediatelly"; this way, if the script failed for some reason, you will get a notification email. 

10. This is it! The script will run daily and will email you if the solar generation in the previous one day was below the threshold. Enjoy.

## Getting a new Tesla refresh token
You will need to get a new Tesla refresh token during the first-time setup above (in step 7), or if the token has expired (in which case the script will send you an email to notify you).
The token should be good for many months.

One-time setup: install the "Access Token Generator for Tesla" Chrome extension at https://chromewebstore.google.com/detail/access-token-generator-fo/djpjpanpjaimfjalnpkppkjiedmgpjpe in your Google Chrome browser.
Note: I am not associated with the developer of that app.

Launch the extension by clicking on the Extensions icon, and then choosing it.
It will ouen the tesla log in page (auth.tesla.com") in a separate tab.
Login with your tesla username and password, as usual. Upon success, it will give you two long strings: an "access" token" and "refresh token".
We want the refresh token. Copy/paste it into the double quotes at `REFRESH_TOKEN= ""` in file `Settings.gs`. This is it.

Note: There are other ways to get a refresh token, but I have found this one to be easiest and safest.
