# Zenkoutei Bot-tan

Zenkoutei Bot-tan (全肯定botたん, Affirmative bot) is a Bluesky bot designed to send replies that completely affirm its followers. By leveraging sentiment analysis and generative AI, its goal is to encourage and uplift its followers.

This bot primarily processes posts written in Japanese.

---

## Overview

This repository contains the code and configuration files for Zenkoutei Bot-tan. The bot operates in two modes:

1. **AI-Generated Replies**: Uses generative AI (Google Gemini) to reply based on follower content (text and images).
2. **Predefined Replies**: Performs sentiment analysis on follower posts (text) using a Japanese polarity dictionary, then selects and sends a response from a predefined list.

---

## Privacy Policy

### Information Collection

This bot collects and processes the following types of information:

- **Follower Post Content**: Post content is used solely to generate replies and is neither stored nor reused.
- **User Metadata**: Basic metadata such as usernames or profile details may be accessed to personalize responses, but this information is never stored.

### Purpose of Information Use

The information collected is only used for generating replies. However, for AI-generated replies, data communication is conducted with Google LLC in compliance with Google Gemini API usage policies.

### Age Restriction

The AI-generated reply functionality of this bot adheres to the Google Gemini API Terms of Service and is restricted to users aged 18 and older. **Users under 18 should either use the "Predefined Reply Mode" described below or refrain from using this bot.**

### Regional Restrictions

The AI-generated reply functionality of this bot adheres to Google Gemini API Terms of Service and is unavailable in the following regions:

- United Kingdom (UK)
- Switzerland
- European Union (EU) member states

**Users residing in these regions should use the "Predefined Reply Mode" described below or refrain from using this bot.**

### Privacy Policy Updates

The privacy policy may be updated from time to time. Any significant changes will be communicated through this repository.

### Contact

For inquiries about this bot or its privacy policy, please contact:  
[Suibari (suibari-cha.bsky.social)](https://bsky.app/profile/suibari-cha.bsky.social)

---

## How to Use

1. Follow this bot on Bluesky.
2. The bot will follow you back and start responding to your posts automatically.

To stop receiving replies from this bot, either unfollow it or block the user.

### Predefined Reply Mode

Predefined Reply Mode has been implemented to comply with the Google Gemini API Terms of Service and enforce age restrictions. By following the steps below, the AI-generated reply functionality will be disabled for a specific follower, and only predefined replies will be used:

1. Ensure the bot follows you, as described in "How to Use."
2. Mention or reply to the bot with the text **"Predefined Reply Mode"**.
3. The bot will confirm the activation of Predefined Reply Mode via a reply.

If you are 18 or older and want to disable U18 Mode, follow these steps:

1. Ensure the bot follows you, as described in "How to Use."
2. Mention or reply to the bot with the text **"Disable Predefined Reply Mode"**.
3. The bot will confirm the deactivation of Predefined Reply Mode via a reply.

---

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

---

## Disclaimer

This bot was developed, operated, and managed personally by Suibari for the purpose of improving technical skills and understanding the AT Protocol. As such, extensive support or updates like those offered by companies may not be possible.

While every effort is made to ensure the bot functions correctly, please use it at your own risk. The developer assumes no responsibility for any errors, damages, or losses resulting from the use of this bot. Your understanding is appreciated.

---
