# Zenkoutei Bot-tan

![bot header](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qcwhrvzx6wmi5hz775uyi6fh/bafkreicd74lb33ywyc54lzgqfyotfuzs55x2cnxztpob5ifg2nr4kiji2e@jpeg)

[Zenkoutei Bot-tan (全肯定botたん, Affirmative bot)](https://bsky.app/profile/suibari-bot.bsky.social) is a Bluesky bot designed to send replies that completely affirm its followers. By leveraging sentiment analysis and generative AI, its goal is to encourage and uplift its followers.

---

## Overview

This repository contains the code and configuration files for Zenkoutei Bot-tan. The bot operates in two modes:

1. **AI-Generated Replies**: Uses generative AI (Google Gemini) to reply based on follower content (text and images).
2. **Predefined Replies**: Performs sentiment analysis on follower posts (text) using a Japanese polarity dictionary, then selects and sends a response from a predefined list.
3. **Predefined mode (AI disabled)**: Users can opt to disable AI-generated replies and receive only template-based responses.
4. **Fortune-telling mode**: The bot can perform a fortune-telling feature upon request.
5. **Reply frequency adjustment**: Users can adjust the bot’s reply frequency from 0% to 100%.
6. **Conversation mode**: Users can engage in continuous conversation with the bot.
7. **Post-analysis mode**: Users can perform a personality analysis by the user's recent posts.
8. **Cheer mode**: 

---

## How to Use

1. Follow this bot on Bluesky.
2. The bot will follow you back and start responding to your posts automatically.

To stop receiving replies from this bot, either unfollow it or block the user.

![bot process flow](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:uixgxpiqf4i63p6rgpu7ytmx/bafkreihxgiteyk25cpv3e7lkdsggntpb3jj6ybha4btq5ykf2fzdyq7j6u@jpeg)

### Predefined Reply Mode

1. Wait to be followed back by the bot.
2. Then mention or reply to the bot with "Predefined Reply Mode".
3. The bot will reply to confirm the mode is enabled.

To disable this mode (for users 18+), mention or reply with "Disable Predefined Reply Mode".
The bot will confirm it is disabled.

### Fortune Mode

1. Wait to be followed back by the bot.
2. Then mention or reply with "Fortune".
3. The bot will reply with your fortune.

You can only use this once every few hours.

### Reply Frequency

1. Wait to be followed back by the bot.
2. Then mention or reply with "freqN" (N = 0 to 100).
3. The bot will confirm your new reply frequency setting.

### Conversation Mode

1. Wait to be followed back by the bot.
2. Then mention or reply with "Talk with me" or "Conversation".
3. The bot will like your post.
4. 10 minutes later, the bot will reply.
5. If you reply to that, the conversation continues.

### Post Analysis Mode

1. Wait to be followed back by the bot.
2. Then mention or reply with "Analyze me".
3. The bot will reply with an analysis image.

This can only be used once every few days.

### Cheer Mode

1. Wait to be followed back by the bot.
2. Then post with the hashtag "#SuiBotCheerSquad" and include what you want support for (image optional).
3. The bot will repost it to support you.

This can only be used once every few hours.

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
[Suibari (suibari.com)](https://bsky.app/profile/suibari.com)

---

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

---

## Disclaimer

This bot was developed, operated, and managed personally by Suibari for the purpose of improving technical skills and understanding the AT Protocol. As such, extensive support or updates like those offered by companies may not be possible.

While every effort is made to ensure the bot functions correctly, please use it at your own risk. The developer assumes no responsibility for any errors, damages, or losses resulting from the use of this bot. Your understanding is appreciated.

---
