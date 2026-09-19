# Builds the C++ command-line solver and tests (Linux, macOS, MSYS2).
#   make          build saferoute and engine_test
#   make test     build and run the tests
#   make wasm     rebuild src/saferoute_wasm.js for the browser (needs Emscripten)
CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra
SOURCES = cpp/algorithms.cpp cpp/scenario.cpp cpp/report.cpp cpp/json.cpp
HEADERS = cpp/algorithms.hpp cpp/scenario.hpp cpp/report.hpp cpp/json.hpp

all: saferoute engine_test

saferoute: cpp/main.cpp $(SOURCES) $(HEADERS)
	$(CXX) $(CXXFLAGS) -o $@ cpp/main.cpp $(SOURCES)

engine_test: tests/engine_test.cpp $(SOURCES) $(HEADERS)
	$(CXX) $(CXXFLAGS) -Icpp -o $@ tests/engine_test.cpp $(SOURCES)

test: engine_test
	./engine_test

wasm:
	sh tools/build_wasm.sh

clean:
	rm -f saferoute saferoute.exe engine_test engine_test.exe

.PHONY: all test wasm clean
