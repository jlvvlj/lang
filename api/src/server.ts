import axios from 'axios';
import { PDFDocument } from 'pdf-lib';
import { Document } from 'langchain/document';
import { writeFile, unlink } from 'fs/promises';
import { UnstructuredLoader } from 'langchain/document_loaders/fs/unstructured';
import { formatDocumentsAsString } from 'langchain/util/document';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { readFile } from 'fs';
import {
    ArxivPaperNote,
    NOTES_TOOL_SCHEMA,
    NOTE_PROMPT,
    outputParser,
  } from "./prompts.js";


async function loadPdfFromUrl(url: string): Promise<Buffer> {
   const response = await axios.get(url, {
        responseType: 'arraybuffer'
     });
    return response.data;
}

async function deletePagesFromPdf(pdfBuffer: Buffer, pagesToDelete: number[]): Promise<Buffer> {
    let numToUpsetBy = 1;
    const pdf = await PDFDocument.load(pdfBuffer);
    pagesToDelete.forEach(page => pdf.removePage(page-numToUpsetBy));
    const pdfBytes = await pdf.save();
    return Buffer.from(pdfBytes);
}

async function convertPdfToDocouments(pdf: Buffer): Promise<Array<Document>> {
    const apiKey = process.env.UNSTRUCTURED_API_KEY;
    if (!apiKey) {
        throw new Error('UNSTRUCTURED_API_KEY environment variable not set');
    }
    const randomName = Math.random().toString(36).substring(7);
    const path = `./pdfs/${randomName}.pdf`;
    await writeFile (path, pdf, 'binary');
    const loader = new UnstructuredLoader(path, {apiKey: apiKey, strategy: 'hi_res'});
    const documents = await loader.load();
    await unlink (path);
    return documents;
}

async function generateNotes(
    documents: Array<Document>
  ): Promise<Array<ArxivPaperNote>> {
    
    const documentString = formatDocumentsAsString(documents);
    
    const baseModel = new ChatOpenAI({
        modelName: 'gpt-4',
        temperature: 0.0
    });

    const notesModel = baseModel.bind({
       tools : [NOTES_TOOL_SCHEMA], 
    });

    const chain = NOTE_PROMPT.pipe(notesModel).pipe(outputParser)

    const response = await chain.invoke({paper: documentString});
   
    return response;
}



  

async function main({pageUrl, name, pagesToDelete}: {
    pageUrl: string, 
    name: string, 
    pagesToDelete?: number[]
})
{
    if (!pageUrl.endsWith('.pdf')) {
        throw new Error('The URL must be a PDF file');
    }

    let pdfAsBuffer = await loadPdfFromUrl(pageUrl);

    if (pagesToDelete && pagesToDelete.length > 0) {
        pdfAsBuffer = await deletePagesFromPdf(pdfAsBuffer, pagesToDelete);
    }

    // const documents = await convertPdfToDocouments(pdfAsBuffer);
    // console.log(documents);
    // write documents to a file
    // const docString = JSON.stringify(documents);
    // await writeFile(`./documents/${name}.json`, docString, 'utf8');

    // const notes = await generateNotes(documents, name);
    
    const docs = await new Promise<string>((resolve, reject) => {
        readFile(`./documents/test.json`, 'utf8', (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });

    const parsedDocs : Array<Document> = JSON.parse(docs);
    const notes = await generateNotes(parsedDocs);
    console.log(notes);
}

main({pageUrl: 'https://arxiv.org/pdf/2405.00352.pdf',name: 'test'});
