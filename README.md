# Tesla Watch

Do you need to monitor your Tesla Solar installation, to make sure it is generating power?

I do. My Tesla solar system had two outages last summer; each time it took me a week to realize that the system was down. I lost hundreds of dollars in lost opportunity to generate power.

So I wrote this simple Tesla Solar installation monitoring system.

Do you also want to monitor your Tesla vehicle?
Eureka! But no, too sad, this is currently not implemented, but I am all ears (or years?).

## You say Prerequisites, I say Whaaat

You shall have a Google account, or shall be willing to create one. 
Everything else is free, courtesy of Google.

## I am soo intrigued! How does it work?

You will setup the included Apps Script to run daily in your [Apps Script account](https://script.google.com/home).

Then you will get a Tesla "refresh token" and store it in the code (you may need to do this every few months).
At every run, the script uses the "refresh token" to connect to the Tesla servers on your behalf to pull solar generation stats,
the same way the official Tesla app does it.
If last day's generated solar energy was below a predefined limit, the script will send email(s) to email recipient(s) of your choice 
(usually to yourself).
In addition, the script will add a row to a Google Spreadsheet, for historical record keeping.
In addition, the script can be setup to send daily, weekly or monthly summary emails.

## Enough of this, you had me at "Tesla". How do I set it up?
Glad you asked. [Instructions are in the TeslaSolarWatch subfolder](TeslaSolarWatch/README.md).

## Why is Google Apps Script awesome for this project?

- Sending emails for free is not a small feat (or feet?); think of it as "impossible if I don't own a domain name". Apps Script does it for free (it limits you to 100 emails sent per day).
- Scheduling things to run repeatedly (in our case daily) is a a big feat. Think linux cron jobs and Windows Task Scheduler. Goose bumps.
- Google Apps Script is Google Cloud on steroids, for free, no prescription needed! I want that to go, please.
- It sounds as If I am trying to sell Google Apps Script too hard... I am. I love Google Apps Script.

## Other Alternatives to monitor my Tesla Solar installation?

I found only one other alternative: [Home Assistant](https://www.home-assistant.io/).
People say that you can set it up to do this. I haven't done it.
Anyways, it requires a dedicated computer (such as a high-end Raspberry Pi) running at all times at your home. No, thanks, I don't want to babysit one more device, and I don't want to monitor the "monitor".

## What's in the cards?
- We could easilly enhance the app to collect e.g. weekly, monthly, yearly energy generaton stats into the Spreasdsheet (in a different tab) and then chart things over time (e.g. overlap stats from each year in one chart, to look for performance degradation).
- We could easilly enhance the app to monitor Powerwall stats (I don't have a powerwall).
- We could also gather stats for your Tesla vehicle. I am not very interested in that, but am willing to collaborate.
- Aliens will arrive on Earth on Feb 29, 2025. Mark your calendars!
