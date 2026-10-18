cmake_minimum_required(VERSION 3.16)
project(smartbill_schedule_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()
add_compile_options(-Wall -Wextra -Wpedantic)

add_library(schedule STATIC src/schedule.cpp)
target_include_directories(schedule PUBLIC include)

add_executable(schedule-engine src/main.cpp)
target_link_libraries(schedule-engine PRIVATE schedule)
# Static C++ runtime: the binary runs on any Linux image (e.g. a slim JRE image on Render) without libstdc++ mismatches.
target_link_options(schedule-engine PRIVATE -static-libstdc++ -static-libgcc)

enable_testing()
add_executable(schedule-tests tests/test_schedule.cpp)
target_link_libraries(schedule-tests PRIVATE schedule)
add_test(NAME unit COMMAND schedule-tests)
add_test(NAME cli COMMAND ${CMAKE_SOURCE_DIR}/tests/cli_tests.sh $<TARGET_FILE:schedule-engine>)
