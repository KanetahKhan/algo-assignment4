@echo off
rem Builds the C++ command-line solver and the C++ test suite, then runs the tests.
rem Needs g++ (MinGW-w64, MSYS2 or Code::Blocks) on PATH.
cd /d "%~dp0"
set SOURCES=cpp\algorithms.cpp cpp\scenario.cpp cpp\report.cpp cpp\json.cpp
where g++ >nul 2>nul || (echo g++ was not found on PATH. Install MinGW-w64 or add its bin folder to PATH. & exit /b 1)
g++ -std=c++17 -O2 -Wall -Wextra -o saferoute.exe cpp\main.cpp %SOURCES% || exit /b 1
g++ -std=c++17 -O2 -Wall -Wextra -Icpp -o engine_test.exe tests\engine_test.cpp %SOURCES% || exit /b 1
echo Built saferoute.exe and engine_test.exe
"%~dp0engine_test.exe"
