#!/bin/bash

# Create simple SVG icons for the Chrome extension
# These are placeholder icons - replace with proper designs

# Function to create SVG icon
create_icon() {
    size=$1
    cat > "icon${size}.svg" << EOF
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#2196F3" rx="4"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="$((size/3))" font-weight="bold" fill="white" text-anchor="middle" dy="0.35em">MA</text>
</svg>
EOF
}

# Create icons
create_icon 16
create_icon 32
create_icon 48
create_icon 128

echo "Icons created successfully!"