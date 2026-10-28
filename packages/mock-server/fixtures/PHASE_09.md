# Phase 9 fixture derivatives

The render JPEGs, sprite sheets, delivery-final.mp4 and delivery-vertical.mp4 are derived locally with FFmpeg from the existing CC0 delivery.mp4 fixture. The horizontal video preserves its original 1920×1080 picture stream; the portrait derivative is scaled/cropped to 1080×1920. Both final delivery files contain stereo AAC at 48kHz. They remain 24-second canned mock media and do not represent a real render of the submitted project.

Eight JPEG previews sample the source at 3-second intervals. Each sprite sheet contains the same eight samples in a four-column layout, using 160×90 tiles. All files are checked in and checksummed in manifest.json. No runtime FFmpeg dependency was added.
