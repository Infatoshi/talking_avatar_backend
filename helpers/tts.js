const sdk = require('microsoft-cognitiveservices-speech-sdk');
const blendShapeNames = require('./blendshapeNames');
const _ = require('lodash');
const axios = require('axios');

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
require('dotenv').config();

const SSML = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US">
<voice name="en-US-JennyNeural">
  <mstts:viseme type="FacialExpression"/>
  __TEXT__
</voice>
</speak>`;

const key = process.env.AZURE_KEY;
const region = process.env.AZURE_REGION;
const API_KEY = process.env.OPENAI_API_KEY;

const preprompt = "You are an AI girlfriend for research experiments and surveys, respond the way a perfect girlfriend would";

let conversationContext = [
    {
        role: 'system',
        content: preprompt
    }
];

async function callGPTWithPreprompt(messageContent) {
    
    // Add the user's message to the conversation context
    conversationContext.push({ role: 'user', content: messageContent });

    const response = await axios.post(ENDPOINT, {
        model: 'gpt-3.5-turbo',
        messages: conversationContext,
        temperature: 0.7,
    }, {
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
        }
    });

    const returnResponse = response.data.choices[0].message.content;


    // Add the assistant's response to the conversation context
    conversationContext.push({ role: 'assistant', content: returnResponse });
    

    // Deduplicate the conversation context
    let uniqueConversation = conversationContext.reduce((accumulator, current) => {
        if (accumulator.findIndex(item => item.content === current.content) === -1) {
            accumulator.push(current);
        }
        return accumulator;
    }, []);
    conversationContext = uniqueConversation;
    
    return returnResponse;

    
}

const textToSpeech = async (text, voice) => {
    return new Promise(async (resolve, reject) => {
        
        const responseText = await callGPTWithPreprompt(text);
        const ssml = SSML.replace("__TEXT__", responseText);

        const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
        speechConfig.speechSynthesisOutputFormat = 5; // mp3
        
        let audioConfig = null;
        let randomString = Math.random().toString(36).slice(2, 7);
        const filename = `./public/speech-${randomString}.mp3`;
        audioConfig = sdk.AudioConfig.fromAudioFileOutput(filename);

        let blendData = [];
        const timeStep = 1/60;
        let timeStamp = 0;
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

        synthesizer.visemeReceived = function (s, e) {
            const animation = JSON.parse(e.animation);
            _.each(animation.BlendShapes, blendArray => {
                let blend = {};
                _.each(blendShapeNames, (shapeName, i) => {
                    blend[shapeName] = blendArray[i];
                });

                blendData.push({
                    time: timeStamp,
                    blendshapes: blend
                });
                timeStamp += timeStep;
            });
        }

        synthesizer.speakSsmlAsync(
            ssml,
            result => {
                synthesizer.close();
                resolve({ blendData, filename: `/speech-${randomString}.mp3` });
            },
            error => {
                synthesizer.close();
                reject(error);
            }
        ); 
    });
};

module.exports = textToSpeech;
