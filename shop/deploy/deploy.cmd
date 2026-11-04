@echo off
rem Deploys the committed shop (git HEAD, not uncommitted edits) to the server: uploads it, builds the
rem image there and restarts the container. Run from anywhere: cmd /c shop\deploy\deploy.cmd
setlocal
set HOST=root@23.246.154.136
set ARCHIVE=%TEMP%\aistudio365-shop.tar.gz
cd /d "%~dp0\..\.."

git diff --quiet HEAD -- shop
if errorlevel 1 echo Note: shop\ has uncommitted changes; they are NOT included in this deploy.

for /f %%i in ('git rev-parse --short HEAD') do set REV=%%i
rem HEAD:shop leaves the repo-root .gitattributes behind, so turn off CRLF conversion: files go out
rem exactly as stored in git (LF).
git -c core.autocrlf=false archive --format=tar.gz -o "%ARCHIVE%" HEAD:shop || exit /b 1
scp -q -o BatchMode=yes "%ARCHIVE%" %HOST%:/tmp/aistudio365-shop.tar.gz || exit /b 1
del "%ARCHIVE%"
ssh -o BatchMode=yes %HOST% "set -e; rm -rf /opt/aistudio365-shop/src.new; mkdir -p /opt/aistudio365-shop/src.new; tar -xzf /tmp/aistudio365-shop.tar.gz -C /opt/aistudio365-shop/src.new; rm /tmp/aistudio365-shop.tar.gz; bash /opt/aistudio365-shop/src.new/deploy/install.sh %REV%"
