# Netlify Deployment Setup Guide

## Required Environment Variables

For the application to work on Netlify, you **must** configure the following environment variables in your Netlify dashboard:

### 1. Go to Netlify Dashboard
1. Log in to [Netlify](https://app.netlify.com)
2. Select your site (`sqlaio`)
3. Go to **Site settings** → **Environment variables**

### 2. Add Required Variables

Add these three environment variables:

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `OPENAI_API_KEY` | `sk-or-v1-your-key-here` | Your OpenRouter API key (get one at [openrouter.ai](https://openrouter.ai/)) |
| `OPENAI_BASE_URL` | `https://openrouter.ai/api/v1` | OpenRouter API base URL |
| `OPENAI_MODEL` | `openai/gpt-4o-mini` | Model to use (or any other model from OpenRouter) |

### 3. Get Your OpenRouter API Key

1. Go to [OpenRouter.ai](https://openrouter.ai/)
2. Sign up or log in
3. Go to **Keys** section
4. Create a new API key
5. Copy the key (starts with `sk-or-v1-`)

### 4. Set Variables in Netlify

1. In Netlify dashboard → Site settings → Environment variables
2. Click **Add a variable**
3. Add each variable:
   - **Key**: `OPENAI_API_KEY`
   - **Value**: Your OpenRouter API key (paste it)
   - Click **Save**
4. Repeat for `OPENAI_BASE_URL` and `OPENAI_MODEL`

### 5. Redeploy

After adding environment variables:
1. Go to **Deploys** tab
2. Click **Trigger deploy** → **Deploy site**
3. Wait for deployment to complete

## Troubleshooting

### Error: "API access forbidden"
- **Cause**: API key is missing, invalid, or doesn't have permissions
- **Solution**: 
  1. Verify the API key is set in Netlify environment variables
  2. Check that the key is correct (no extra spaces)
  3. Ensure the key has the correct permissions in OpenRouter
  4. Redeploy after adding/updating variables

### Error: "OpenRouter API key is required"
- **Cause**: `OPENAI_API_KEY` environment variable is not set
- **Solution**: Add the `OPENAI_API_KEY` variable in Netlify dashboard

### Error: 401 Unauthorized
- **Cause**: Invalid API key
- **Solution**: Generate a new API key from OpenRouter and update it in Netlify

## Alternative: Using OpenAI Directly

If you want to use OpenAI directly instead of OpenRouter:

| Variable Name | Value |
|--------------|-------|
| `OPENAI_API_KEY` | `sk-...` (your OpenAI API key) |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | `gpt-4o-mini` (or `gpt-4`, `gpt-3.5-turbo`, etc.) |

## Notes

- Environment variables are **not** committed to git (they're in `.gitignore`)
- You must set them in Netlify dashboard for production
- Changes to environment variables require a redeploy to take effect
- Never share your API keys publicly
