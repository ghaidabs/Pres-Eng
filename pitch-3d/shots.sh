#!/bin/sh
# Screenshot each stop (instant camera, copy visible) into ./shots. Usage: sh shots.sh [stop numbers...]
cd "$(dirname "$0")"; mkdir -p shots
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
URL="file:///C:/Pres_eng/Gab%C3%A8s%20Pitch%203D.html?shot"
for i in ${@:-1 2 3 4 5 6 7 8 9 10 11}; do
  "$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars \
    --window-size=1600,900 --virtual-time-budget=5000 --screenshot="C:/Pres_eng/pitch-3d/shots/s$i.png" "$URL#s$i" 2>/dev/null
done
ls shots
