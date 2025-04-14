# SCL 'publish_badge' Netlify Function for Course Completion Badges

This simple Netlify project handles badge generation for students who have completed an SCL course on Canvas.

The script is extremely simple and relies on free-tier features from Canvas, Netlify and Canvas Badges to function.

## Instructions

There is an HTML form in the public/ directory for each course in the SCL library of courses on Canvas.
These forms should appear within an iframe on the completion module of each course (this module is only shown
when the user completes the course).

The user can then enter their email to have the script generate a badge on Canvas Badges, which on doing so 
will email the user if this is the first time the badge is created.

The script will also email the user with the badge link, even if the same badge is being requested again (Canvas
Badges will only send an email the first time the badge is created).

Finally, this script is meant to log a line in an SCL google sheet recording the student and badge information.