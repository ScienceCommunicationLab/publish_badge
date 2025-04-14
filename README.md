# SCL 'publish_badge' Netlify Function for Course Completion Badges

This simple Netlify project handles badge generation for students who have completed an SCL course on Canvas.

The script is extremely simple and relies on free-tier features from Canvas, Netlify and Canvas Badges to function.

The script will :
- call Canvas Badges via API to generate the badge
- email the student with the badge URL
- log a line in an SCL google sheet recording the student and badge information.
- write progress information to the Netlify logs

## Instructions

There is an HTML form in the public/ directory for each course in the SCL library of courses on Canvas.
These forms should appear within an iframe on the completion module of each course (this module is only shown
when the user completes the course).

The user can then enter their email to have the script generate a badge on Canvas Badges, which on doing so 
will email the user if this is the first time the badge is created.

If a new course needs to be supported, add another HTML file to the public folder, and then update the script
with the new course's badge class ID.

## Canvas Badges Credentials    
The Netlify function's environment should be configured with the SCL API key for Canvas Badges.