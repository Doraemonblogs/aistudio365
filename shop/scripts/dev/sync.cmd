@echo off
rem Copies the shop source (without node_modules, dist and data) to the dev folder on the server.
rem Builds, tests and imports run there in Docker; see scripts\dev\run.sh.
setlocal
set HOST=root@23.246.154.136
set REMOTE=/root/aistudio365-shop-dev
cd /d "%~dp0\..\.."
tar -cf - --exclude=node_modules --exclude=dist --exclude=data . | ssh -o BatchMode=yes %HOST% "mkdir -p %REMOTE% && tar -xf - -C %REMOTE% && find %REMOTE% -name '*.sh' -exec sed -i 's/\r$//' {} +"
