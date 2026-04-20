const express = require('express')
const path = require('path')
var cors = require('cors')
const fs = require('fs')
var parseString = require('xml2js').parseString
const app = express()
const port = 3000
const indexing = { "xml" : {title: {},company : {},model : {}}, "json" : {title: {},company : {},model : {}} };
app.use(cors())

async function parseXml(code,format) {
    return new Promise((resolve, reject) => {
        if(format == "xml") {
            parseString(code, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        }else {
            resolve(JSON.parse(code));
        }
    });
}

async function getParsedFile(file,format) {
    const xml = await fs.promises.readFile(path.join(__dirname, 'data', format, file), 'utf-8');
    return await parseXml(xml,format)
}


async function getFilesIndexing(format) {
    const files = await fs.promises.readdir(path.join(__dirname, 'data', format));

    for (const file of files) {
        const jsonF = await getParsedFile(file,format);
        const values = {
            "xml" : {
                "title" : jsonF?.product?.title?.[0],"company" : jsonF?.product?.company?.[0] , "model" : jsonF?.product?.model?.[0]
            },
            "json" : {
                "title" : jsonF?.title,"company" : jsonF?.company , "model" : jsonF?.model
            }
        };
        for(let key of Object.keys(indexing[format])) {
            if(values[format][key]) {
                for(let subkey of values[format][key].split(" ")) {
                    subkey = subkey.toLowerCase();
                    if(!indexing[format][key][subkey]) {
                        indexing[format][key][subkey] = [file];
                    }else if(!indexing[format][key][subkey].includes(file)) {
                        indexing[format][key][subkey].push(file)
                    }

                }
            }
        }
    }
}

function rankingScore(finalKeys, file, type, format) {
    if (!finalKeys || !file) return 0;

    var product = format == 'xml' ? file?.product?.[type]?.[0] : file?.[type];
    if (!product) return 0;

    product = product.toLowerCase().split(' ');
    const querySet = new Set(finalKeys.map(k => k.toLowerCase()));

    const intersection = product.filter(word => querySet.has(word));

    const union = new Set([...querySet, ...product]);

    return intersection.length / union.size;
}


getFilesIndexing('xml').then(() => {
    getFilesIndexing('json').then(() => {
        console.log(indexing['xml'])
        app.get('/api/xml',async(req,res) => {
            const files = await fs.promises.readdir(path.join(__dirname, 'data', 'xml'));
            var table = []
            for(var file of files) {
                if(file) {
                    table.push(await getParsedFile(file,'xml'));
                }
            }
            res.status(200).json(table)

        })
        app.get('/api/json',async(req,res) => {
            const files = await fs.promises.readdir(path.join(__dirname, 'data', 'json'));
            var table = []
            for(var file of files) {
                if(file) {
                    table.push(await getParsedFile(file,'json'));
                }
            }
            res.status(200).json(table)

        })
        app.get('/api/xml/search', async(req, res) => {
            const input = req.query.input;
            const type = req.query.type;
            if(type != "title" && type != "company" && type != "model") return res.status(400).json("error");
            if(!input) return res.status(400).json('error');
            const inputKeys = input.toLowerCase().split(' ');
            const finalKeys = [...new Set(inputKeys)]
            var currentFiles = [];
            const ids = [];
            for(var key of finalKeys) {
                if(indexing['xml'][type][key]) {
                    for(var subfiles of indexing['xml'][type][key]) {
                        if(subfiles) {
                            var json = await getParsedFile(subfiles,'xml');
                            if(!ids.includes(json?.product?.$?.id)) {
                                currentFiles.push({score : rankingScore(finalKeys,json,type,'xml'),...json});
                                ids.push(json?.product?.$?.id);
                            }
                        }
                    }
                }
            }
            currentFiles = currentFiles.sort((a,b) => b.score - a.score)
            res.status(200).json(currentFiles)
        })
        app.get('/api/json/search', async(req, res) => {
            const input = req.query.input;
            const type = req.query.type;
            if(type != "title" && type != "company" && type != "model") return res.status(400).json("error");
            if(!input) return res.status(400).json('error');
            const inputKeys = input.toLowerCase().split(' ');
            const finalKeys = [...new Set(inputKeys)]
            var currentFiles = [];
            const ids = [];
            for(var key of finalKeys) {
                console.log(key)
                if(indexing['json'][type][key]) {
                    for(var subfiles of indexing['json'][type][key]) {
                        if(subfiles) {
                            var json = await getParsedFile(subfiles,'json');
                            if(!ids.includes(json?.id)) {
                                currentFiles.push({score : rankingScore(finalKeys,json,type,'json'),...json});
                                ids.push(json?.id);
                            }
                        }
                    }
                }
            }
            currentFiles = currentFiles.sort((a,b) => b.score - a.score)
            res.status(200).json(currentFiles)
        })
        app.listen(port, () => {
            console.log(`Example app listening on port ${port}`)
        })
    })
})
    

