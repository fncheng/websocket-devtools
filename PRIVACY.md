# Privacy Policy for WebSocket DevTools

**Last Updated: November 2026**

## Overview

WebSocket DevTools is a browser extension for Google Chrome and Microsoft Edge designed to help developers monitor, debug, and simulate WebSocket connections. We are committed to protecting your privacy and being transparent about our data practices.

## Data Collection and Processing

### What We DON'T Collect
- **Personal Information**: We do not intentionally collect personal information, but captured traffic and URLs may contain personal or sensitive data that is processed locally.
- **No Browsing History**: We do not track or record your browsing activity
- **No External Transmission**: No data is sent to external servers or third parties
- **No Analytics**: We do not use analytics services or tracking mechanisms
- **No Cookies**: We do not set or use cookies for tracking purposes

### What We DO Process Locally
- **WebSocket Traffic**: Intercepts and displays WebSocket messages on pages you choose to debug
- **Extension Settings**: Stores your preferences (monitoring state, favorites) in local browser storage
- **Favorite Messages**: Saves WebSocket messages you mark as favorites for reuse
- **Connection Data**: Temporarily holds WebSocket connection information during debugging sessions

### Local Storage Only
All data processing occurs entirely within your browser using browser-specific local storage APIs:
- **chrome.storage.local** (Chrome) / **browser.storage.local** (Edge): For extension settings and preferences
- **Browser Local Storage**: For temporary debugging data and favorites
- **No Cloud Storage**: Nothing is synchronized to external servers

## How We Use Your Data

### SSE observation
- **Data**: SSE connection URLs, available request method and HTTP status, event names, server event IDs and event data from page `EventSource` and `fetch` streams. Request bodies, credentials and authorization headers are not separately collected.
- **Storage**: Captured events are held in bounded extension memory, not durable history. Existing WebSocket capture and optional saved favorites follow their respective policies below.
- **Scope**: New pages are injected only while the extension is enabled. Existing injections follow the monitoring state; turning off the extension does not stop observation on already injected pages. Pause monitoring or reload the page to stop it. Observation can begin before DevTools is opened and pausing does not cancel application requests.

### WebSocket Monitoring
- **Purpose**: To help you debug WebSocket connections on your chosen web pages
- **Scope**: Only monitors pages where you actively use the DevTools panel
- **Storage**: Data is temporarily held in memory and local storage during debugging sessions
- **Retention**: Connection data is cleared when you close DevTools or refresh the page

### Favorites System
- **Purpose**: To save frequently used WebSocket messages for testing
- **Storage**: Stored locally in your browser using browser storage APIs (chrome.storage.local in Chrome, browser.storage.local in Edge)
- **Control**: You can view, edit, or delete favorites at any time through the extension interface

### Settings and Preferences
- **Purpose**: To remember your extension preferences across sessions
- **Data**: Language preference, monitoring state, window positions
- **Storage**: Stored locally using browser storage APIs (chrome.storage.local in Chrome, browser.storage.local in Edge)
- **Control**: You can reset all settings by disabling and re-enabling the extension

## Permissions and Their Purpose

### Required Permissions
- **activeTab**: 
  - Purpose: Access the current tab to inject WebSocket monitoring scripts
  - Scope: Only the tab you're currently debugging
  - Usage: Enables the extension to monitor WebSocket traffic on the active page

- **storage**: 
  - Purpose: Save your preferences and favorites locally
  - Scope: Local browser storage only
  - Usage: Persist settings between browser sessions

### Host Permissions
- **http://*/*** and **https://*/***: 
  - Purpose: Inject monitoring scripts into web pages to intercept WebSocket connections
  - Scope: Enabled HTTP and HTTPS pages, including before DevTools is opened
  - Usage: Required to proxy WebSocket API and capture connection events

## Data Sharing and Third Parties

- **No Data Sharing**: We do not share any data with third parties
- **No External Services**: The extension operates entirely offline within your browser
- **No Advertising**: We do not serve ads or work with advertising networks
- **No Monetization**: This is a free tool with no revenue collection

## Data Security

### Local Security
- All data remains on your device
- Uses browser's secure storage APIs (Chrome/Edge)
- No network transmission of debugging data
- Extension code is minified and validated by Chrome Web Store and Microsoft Edge Add-ons store

### Access Control
- Only you can access your debugging data
- No remote access capabilities
- Data is tied to your browser profile (Chrome or Edge)

## Your Rights and Control

### Data Access
- View all stored favorites through the extension interface
- Check extension storage usage in browser settings (Chrome/Edge)
- Export or backup favorites manually if needed

### Data Deletion
- Clear all data by removing the extension
- Delete individual favorites through the interface
- Reset settings using the extension's reset functionality

### Opt-Out
- Disable monitoring by turning off the extension
- Uninstall the extension to remove all local data
- Use incognito mode for temporary debugging without storage

## Children's Privacy

This extension is designed for web developers and is not intended for children under 13. We do not knowingly collect data from children.

## Changes to This Policy

We may update this privacy policy to reflect changes in our practices or for legal reasons. The "Last Updated" date at the top indicates when the policy was last modified.

## Open Source Transparency

WebSocket DevTools is open source. You can review our code at:
- **GitHub Repository**: https://github.com/law-chain-hot/websocket-devtools
- **Code Audit**: All data processing logic is transparent and auditable

## Contact Information

For privacy-related questions or concerns:
- **Email**: ianloe666@gmail.com
- **GitHub Issues**: https://github.com/law-chain-hot/websocket-devtools/issues
- **Project Homepage**: https://github.com/law-chain-hot/websocket-devtools

## Browser Compatibility

This extension is compatible with:
- **Google Chrome**: Available on Chrome Web Store
- **Microsoft Edge**: Available on Microsoft Edge Add-ons store
- **Cross-browser Support**: Same privacy standards apply across all supported browsers

## Summary

WebSocket DevTools prioritizes your privacy by:
- Processing all data locally in your browser (Chrome/Edge)
- Never transmitting data to external servers
- Giving you full control over your debugging data
- Operating transparently as an open-source project
- Using minimal, necessary permissions only

This extension is built for developers, by developers, with a commitment to privacy and transparency across all supported browsers. 
