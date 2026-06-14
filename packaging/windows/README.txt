========================================================================
 Homeo Trust — Windows  (Quick Start)
 Developed by Jaswanth Pasumarthy — jassu827@gmail.com
========================================================================

Runs on your own Windows 10/11 PC (64-bit). No admin rights, nothing to
install — everything is in this folder. The app opens at
http://127.0.0.1:8787 and is reachable only from this computer.

>>> FULL step-by-step instructions are in  SETUP_GUIDE.txt  (open it in
    Notepad). Read that if anything below is unclear, ESPECIALLY if you
    are using a NeonDB cloud database.


 FIRST: pick your database (see SETUP_GUIDE.txt, Step 0)
 ------------------------------------------------------------------------
   * LOCAL (recommended): all data stays on this PC, works offline.
     Use the FULL package (it has a postgres\ folder).
   * NEONDB (for low-spec laptops): database in the cloud, needs internet,
     patient data is stored on a third-party cloud. Use the LITE package.


 QUICK START — LOCAL (full package)
 ------------------------------------------------------------------------
   1. Unzip somewhere simple (e.g. C:\HomeoTrust).
   2. Double-click  setup.bat  — WRITE DOWN the admin username + temporary
      password it prints (shown only once).
   3. Double-click  start.bat  — log in as admin and set your password.

   Later: just double-click start.bat. To stop: close its window.


 QUICK START — NEONDB (lite package)
 ------------------------------------------------------------------------
   Needs a few more steps (create a free Neon database, paste two
   connection links into .env). Please follow TRACK B in SETUP_GUIDE.txt
   click-by-click.


 EVERYDAY USE
 ------------------------------------------------------------------------
   start.bat   - start the app (use it every time)
   update.bat  - install a new version (keeps your data + settings)
   repair.bat  - fix a lost .env / database connection (Local mode)
   setup.bat   - first-time setup only (safe to re-run)

   Your data lives in the  data\  folder; your settings + security key
   live in  .env . BACK UP BOTH (see SETUP_GUIDE.txt, section 6).


 TROUBLE?
 ------------------------------------------------------------------------
   See SETUP_GUIDE.txt, section 7 (SmartScreen "unblock", port in use,
   database connection, forgotten password).
========================================================================
