# Zenkoutei Bot-tan (Full Affirmation Bot)

![bot header](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qcwhrvzx6wmi5hz775uyi6fh/bafkreicd74lb33ywyc54lzgqfyotfuzs55x2cnxztpob5ifg2nr4kiji2e@jpeg)

[Zenkoutei Bot-tan](https://bsky.app/profile/bot-tan.suibari.com) is a Bluesky bot designed to send replies that completely affirm its followers. By leveraging sentiment analysis and generative AI, its goal is to encourage and uplift its followers.

---

## Overview

This repository contains the code and configuration files for Affirmation Bot-tan.  
The bot has the following features:

1. **AI-generated replies**: Uses generative AI (Google Gemini) to reply to follower posts (text or images).
2. **Template replies**: Uses a Japanese sentiment polarity dictionary to analyze follower posts (text) and reply with preset messages.
3. **Fortune-telling**: Provides fortunes upon user request.
4. **Reply frequency adjustment**: Users can adjust how often the bot replies (0–100%).
5. **Conversation mode**: Allows continuous conversation with the bot.
6. **Personality analysis**: Analyzes and replies with a personality report.
7. **Cheering**: Reposts user content for promotion.
8. **DJ mode**: Selects music for the user.
9. **Diary mode**: Creates a diary based on the user’s posts.
10. **Anniversary mode**: When an anniversary comes, the bot will celebrate it.

Additionally, this bot offers a subscription plan to cover operational costs.  

Below is a comparison of available features for regular followers vs. subscribers. Details about subscription are available on [Patreon](https://www.patreon.com/posts/about-enhanced-133404007).

| Subscription | Template Replies | AI Replies | Fortune | Frequency Control | Conversation | Analysis | Cheering | DJ | Diary | Anniversary |
| ------------ | ---------------- | ---------- | ------- | ---------------- | ------------ | -------- | --------- | -- | ----- | ----------- |
| Regular      | ✓                | ✓*          | ✓       | ✓                |              | ✓        |           | ✓  |       | ✓     |
| Subscriber   |                  | ✓          | ✓       | ✓                | ✓            | ✓        | ✓         | ✓  | ✓     | ✓   |

*: AI-generated replies for regular followers occur randomly.

---

## How to Use
1. Follow the bot on Bluesky.  
2. After some time, the bot will follow you back and start replying to your posts.  

Unfollowing or blocking the bot will stop all future replies.  

The flowchart below illustrates how the bot responds to your posts:

![bot flow](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:uixgxpiqf4i63p6rgpu7ytmx/bafkreihxgiteyk25cpv3e7lkdsggntpb3jj6ybha4btq5ykf2fzdyq7j6u@jpeg)

### Fortune-telling
1. After being followed back by the bot, Mention or reply to the bot with **"fortune"**.  
2. The bot will reply with your fortune result.  

(*You can only use this once every few hours.*)

### Reply Frequency Control
1. After being followed back by the bot, mention or reply with **"freqN"** (N = 0–100).  
2. The bot will confirm your setting.  

### Conversation Mode
1. After being followed back by the bot, start a thread where you are the main poster.  
2. Reply to the bot in the thread.  
3. The bot will like your post.  
4. The bot will reply.  
5. If you reply to that, the conversation continues (repeat from step 3).  

### Personality Analysis
1. After being followed back by the bot, Mention or reply to the bot with **"analyze me"**.  
2. The bot will reply with an image containing your analysis result.  

(*You can only use this once every few days.*)

### Promotion Support
1. After being followed back by the bot, post with the hashtag **"#SuiBotCheerSquad"** and the content you want promoted (no need to reply directly to the bot).  
2. The bot will repost your post to promote it to followers.  

(*You can only use this once every few hours.*)

### DJ Mode
1. After being followed back by the bot, Mention or reply to the bot with **"DJ please"**.  
2. The bot will recommend a song.  

(*You can only use this once every few minutes.*)

### Diary Mode
1. After being followed back by the bot, mention or reply with **"keep diary"**.  
2. The bot will reply with a daily diary every evening, based on your posts.  
3. To disable, mention or reply with **"stop diary"**.  

### Anniversary Mode
When an anniversary arrives, the bot will celebrate it in reply to the first user post of that day.
There are two types of anniversaries: **preset anniversaries** and **user-registered anniversaries**.

* **Preset anniversaries** refer to common holidays such as Christmas or New Year’s Day.
* **User-registered anniversaries** are personal anniversaries that each user can set once.

You can register a user anniversary using the following steps:

1. Follow this bot according to the “How to Use” instructions.
2. Post a mention or reply to this bot with **"Remember anniversary, MM/DD”** (e.g., "Remember anniversary, 12/31”).
3. Upon successful registration, the bot will confirm it.
4. On the anniversary date, the bot will reply to the user’s post to celebrate (if the user doesn’t post that day, no celebration will occur).
5. To check your registered anniversary, post a mention or reply to this bot with **"Tell me anniversary”**.

---

## Privacy Policy

### Information Collection

This bot collects and processes the following types of information:

- **Follower Post Content**: Post content is used solely to generate replies and is neither stored nor reused.
- **User Metadata**: Basic metadata such as usernames or profile details may be accessed to personalize responses, but this information is never stored.

### Purpose of Information Use

The information collected is only used for generating replies. However, for AI-generated replies, data communication is conducted with Google LLC in compliance with Google Gemini API usage policies.

### Age Restriction
AI-based features comply with Google Gemini’s Terms of Service and are only available to users **18 years and older**.  
Template replies (non-AI) are available to all users.  

### Regional Restriction
AI-based features cannot be used in the following regions (per Google Gemini’s Terms of Service):

- United Kingdom (UK)  
- Switzerland  
- EU Member States  

Template replies (non-AI) are available regardless of region.  

### Privacy Policy Updates

The privacy policy may be updated from time to time. Any significant changes will be communicated through this repository.

### Contact

For inquiries about this bot or its privacy policy, please contact:  
[Suibari (suibari.com)](https://bsky.app/profile/suibari.com)

---

## License
This project is OSS, released under the MIT License.  
See [LICENSE](./LICENSE) for details.  

### References
This bot uses:  
- [Japanese Sentiment Polarity Dictionary](https://www.cl.ecei.tohoku.ac.jp/Open_Resources-Japanese_Sentiment_Polarity_Dictionary.html), Tohoku University (Inui/Okazaki Laboratory).  
- [English Sentiment Polarity Dictionary](http://www.lr.pi.titech.ac.jp/~takamura/pndic_en.html), Tokyo Institute of Technology (Okumura/Takamura Laboratory).  

---

## Disclaimer

This bot was developed, operated, and managed personally by Suibari for the purpose of improving technical skills and understanding the AT Protocol. As such, extensive support or updates like those offered by companies may not be possible.

While every effort is made to ensure the bot functions correctly, please use it at your own risk. The developer assumes no responsibility for any errors, damages, or losses resulting from the use of this bot. Your understanding is appreciated.
