#!/usr/bin/env bash
# Munta la web a _site/ (copia el codi compartit del pla dins de la web).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf _site && mkdir -p _site
cp -r web/. _site/
mkdir -p _site/js/shared
cp supabase/functions/_shared/{plan,pace,adapt}.js _site/js/shared/
touch _site/.nojekyll
echo "Web muntada a _site/"
