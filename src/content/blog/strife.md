---
title: Strife: Mumble voice and Helltube in one place
date: 2026-09-27
summary: A desktop app that combines native Mumble voice, chat, and shared video while preserving each service's independence.
tags: Strife, C# & .NET, Desktop applications
readingTime: 2 min read
---

Strife combines a Mumble voice client with [Helltube](/blog/helltube) in one desktop workspace. Voice rooms and user controls sit beside chat and shared video. The panels can be docked, floated, resized, or collapsed, so the layout can follow what the group is doing. Moving a panel preserves the chat draft and the embedded Helltube session.

The desktop host is written in C# with .NET and PhotinoX. Its web interface handles presentation, while a separate native process runs Mumble's audio and networking code. Capture, Opus encoding, encryption, jitter buffering, and global shortcuts stay with Mumble. A small control adapter exposes actions such as connecting, joining a channel, muting, and sending chat, and sends channel and user state back to the host. Audio samples never travel through the web interface.

That division makes useful desktop behavior available without recreating an audio client in JavaScript. Push to talk uses Mumble's native shortcut engine, including when another application has focus. Audio settings open the native settings dialog, and new Strife profiles start with RNNoise selected. The desktop owns the voice process through an authenticated local connection; closing the host or losing that connection shuts the engine down. Reloading the interface can restore the current voice state without reconnecting to the server.

Embedding Helltube takes more than placing an iframe beside the channel list. Remote login cookies and a local desktop origin have to work together. Strife uses a separate loopback proxy for Helltube's HTTP and WebSocket traffic, with cookies isolated by upstream server. The video pane stays separate from the shell's native controls. Mumble and Helltube retain their own accounts and connection lifecycles, so losing video does not also disconnect voice.

Existing Mumble users can review and import settings, saved server data, and certificate identity. Keeping that identity matters because it preserves server registrations. The importer stages a snapshot, backs up the data it will replace, and attempts restoration if applying the import or restarting voice fails. It also keeps saved server passwords out of the web interface.

Much of Strife's work lives in these transitions: rearranging panels without losing state, reloading a view without interrupting a call, and opening native dialogs in the right window. The source includes integration checks using real voice engines and an isolated Mumble server, plus desktop checks for the embedded Helltube session. Those boundaries are what let voice, chat, and video share a window while remaining independently useful.
