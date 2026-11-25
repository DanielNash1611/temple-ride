import { createAnalytics } from "./browser.js";
export const analytics = createAnalytics({
  "app": "temple-ride",
  "origins": [
    "https://temple-ride.vercel.app",
    "https://templeride.danielnash.co",
    "https://temple-ride-danash1611-3756s-projects.vercel.app",
    "https://temple-ride-git-main-danash1611-3756s-projects.vercel.app"
  ],
  "previewPrefix": "temple-ride",
  "pages": [
    "/",
    "/other"
  ],
  "events": [
    "signup_started",
    "signup_completed"
  ]
});
