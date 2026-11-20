#!/bin/bash
# Vercel Ignored Build Step Script
# Return 0 (exit 0) to CANCEL/SKIP the build in Vercel
# Return 1 (exit 1) to PROCEED with the build in Vercel

node scripts/vercel-ignore-build.js
exit $?
