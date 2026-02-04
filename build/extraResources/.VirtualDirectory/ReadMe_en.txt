# Virtual Directory Guide

## Overview

`.VirtualDirectory` is an automatically generated virtual directory by this application, used to display the file structure after intelligent organization. It maintains a one-to-one correspondence with files in the original directory, but uses intelligent naming.

## Purpose

The main purpose of this virtual directory is to allow users to preview the results of file organization without actually moving or copying the original files.
When you are satisfied with the final result, you can click "Organize Real Directory" to organize the real directory to match the file structure of .VirtualDirectory, and then this application will delete the .VirtualDirectory directory.

## Technical Principles

### Hard Link Technology

Files in the virtual directory are generated using hard link technology. Hard links can be simply understood as references or aliases to files, with the following characteristics:

1. No additional physical disk space is occupied
2. Shares the same data blocks with the original file
3. Modifications to hard-linked files are synchronized to the original file
4. Deleting a hard-linked file does not affect the original file
5. When deleting the original file, it is necessary to delete the hard-linked file (this application will actively detect file deletions in the real directory and correspondingly delete the hard-linked files in the virtual directory.)

### Difference from Shortcuts

Although hard links are similar to shortcuts in some ways, there are important differences between them:

| Feature | Shortcuts | Hard Links |
|---------|-----------|------------|
| File System Level | Windows concept only | Operating system file system feature |
| Space Occupied | Minimal (metadata only) | No additional space |
| Deleting Original File | Shortcut becomes invalid | Hard link can still access file content |
| Modifying Content | Does not affect original file | Synchronized to all links |
| Cross-volume Support | Supported | Limited to same file system |