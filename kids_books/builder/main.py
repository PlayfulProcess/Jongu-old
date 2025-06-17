import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import openai

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = openai.OpenAI(api_key=OPENAI_API_KEY)

SYSTEM_PROMPT = '''You are a helpful, creative book assistant for families and educators. When asked to generate a story page, always reply in this format:

Story Text:
<the text that should appear in the book, for children to read>

Image Prompt:
<a vivid, visual description for DALL·E, including any text to overlay, e.g. 'A little girl in a lavender dress, running through a field at sunset, with the words: "You are brave."'>

Do not include any other commentary or instructions. Only output these two sections, clearly labeled. The image prompt should be suitable for DALL·E 3 and include overlay text if appropriate.'''

app = FastAPI()

# Allow CORS for local dev and your domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    messages: list

@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    # Prepend system prompt
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + req.messages
    response = client.chat.completions.create(
        model="gpt-4",
        messages=messages,
        max_tokens=512,
        temperature=0.8,
    )
    return {"reply": response.choices[0].message.content}

class ImageRequest(BaseModel):
    prompt: str

@app.post("/generate-image")
async def generate_image(req: ImageRequest):
    try:
        response = client.images.generate(
            model="dall-e-3",
            prompt=req.prompt,
            n=1,
            size="1024x1024"
        )
        image_url = response.data[0].url
        return {"image_url": image_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 