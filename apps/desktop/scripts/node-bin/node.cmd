@echo off
set ELECTRON_RUN_AS_NODE=1
"%ASTRO_ONE_DESKTOP_NODE_EXECUTABLE%" --expose-internals %*
