#!/bin/sh
# Compiles the C++ engine to WebAssembly for the browser: writes src/saferoute_wasm.js,
# then rebuilds the standalone HTML. Needs Emscripten (emsdk_env) and Node.js.
set -e
cd "$(dirname "$0")/.."
em++ -std=c++17 -O2 -fexceptions \
  cpp/wasm_bridge.cpp cpp/algorithms.cpp cpp/scenario.cpp cpp/report.cpp cpp/json.cpp \
  -o src/saferoute_wasm.js \
  -sMODULARIZE=1 -sEXPORT_NAME=createSafeRouteModule -sSINGLE_FILE=1 -sENVIRONMENT=web,node \
  -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=4MB \
  -sEXPORTED_FUNCTIONS=_saferoute_call -sEXPORTED_RUNTIME_METHODS=cwrap
node tools/build.js
