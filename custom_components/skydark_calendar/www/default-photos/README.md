# Sample photos

`1.png` through `8.png` are shown on the Photos page and in sleep mode until the
family adds photos of their own. As soon as at least one photo has been added,
the samples are hidden.

Photos added from the Photos page are resized in the browser and stored in Home
Assistant under **Media > My Media > Calendar Images**, so they survive reloads
and appear on every display. Automations can add photos too with the
`skydark_calendar.upload_photo` service.

To change the samples, replace these files (keeping the same names) and run
`npm run build` in the `frontend` folder.
