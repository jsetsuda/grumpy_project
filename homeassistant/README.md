# Grumpy — Home Assistant Configuration

Configuration snippets, blueprints, and automations for the Home Assistant VM.

## What Goes Here

- Wyoming Protocol integration configs
- Assist pipeline configuration
- Conversation agent setup (Ollama, Anthropic)
- Automations and blueprints that support the Grumpy system
- Custom sentences / intent scripts

## This Machine's Role

Home Assistant is the **orchestrator**. It:
- Manages all device integrations
- Runs the Assist pipeline (wake → STT → intent/conversation → TTS)
- Connects to the Backend VM via Wyoming Protocol
- Exposes the WebSocket API the Pi dashboard consumes
- Applies policy, logging, and routing for all voice/LLM interactions

## Setup

This directory contains reference configs and documentation. HA configuration
lives on the HA VM itself (typically `/config/`). Use these files as guides
when configuring integrations.
