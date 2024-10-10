// const fs = require('fs');
import fs from 'fs';
// const path = require('path');
import path from 'path';
// const axios = require('axios');
import axios from 'axios';
// const cheerio = require('cheerio');
import * as cheerio from 'cheerio';

const files = [
    'InRelease',
    'Release',
    'Release.gpg',
];

const __dircwd = process.cwd();

const __dist = process.env.MIRROR_DIR_PATH ?? path.join(__dircwd, 'mirror');
const __mirror = process.env.MIRROR_LIST_PATH ?? path.join(__dircwd, 'mirror.list');

const mirrors = () => {
    if (fs.existsSync(__mirror)) {
        const data = fs.readFileSync(__mirror);

        return data.toString().split('\n');
    } else {
        fs.writeFileSync(__mirror, '');
        return [];
    }
}

const download = async ({
    url,
    dist
}) => {
    return new Promise(async (resolve) => {
        try {
            const filename = path.basename(url);
            const filedir = path.join(__dist, dist);
            const filepath = path.join(filedir, filename);

            // check dist directory exists
            if (fs.existsSync(filedir) == false) {
                fs.mkdirSync(filedir, { recursive: true });
            }

            // check if exists file 
            if (fs.existsSync(filepath)) {
                return resolve([true, null]);
            }

            console.log(`Downloading\t\t\t${url}`);


            const stream = fs.createWriteStream(filepath);

            const res = await axios.get(url, { responseType: 'stream' });

            if (res.status == 404) {
                stream.close();
                res.data.destroy();
                resolve([false, '404'])
            }

            res.data.pipe(stream);

            stream.on('error', (error) => {
                stream.close();
                resolve([false, error]);
            });

            stream.on('close', () => {
                resolve([true, null]);
            });

        } catch (error) {
            resolve([false, error]);
        }
    });
}

const head = async ({ url }) => {
    try {
        const res = await axios.head(url);

        const contentType = res.headers['content-type'];
        const contentLength = res.headers['content-length'] ? parseInt(res.headers['content-length']) : 0;
        const file = !contentType.includes('html') || files.includes(path.basename(url));

        return [{
            contentType: contentType,
            file: file,
            size: contentLength,
        }, null];
    } catch (error) {
        return [null, error];
    }
}

const a = ({ html }) => {
    const $ = cheerio.load(html);

    return $('a').map((i, elem) => {
        return $(elem).attr('href')?.toString();
    }).toArray().filter((item) => !item.includes('#'));
}

const walk = async ({
    url,
}) => {
    const origin = (new URL(url)).origin;

    const output: any = {
        dist: url.replace(origin, ''),
        folders: [],
        files: [],
        size: 0,
    };

    const res = await axios.get(url);

    if (typeof res.data == 'string') {
        const links = a({ html: res.data });

        for (const path of links) {
            const url = `${origin}${path}`;

            const [result] = await head({ url });

            if (result) {
                if (result.file) {
                    output.size += result.size;
                    output.files.push(url);
                } else {
                    output.folders.push(url);
                }
            }
        }
    }

    if (typeof res.data == 'object') {
        for (const item of res.data) {
            if (item.is_dir) {
                output.folders.push(`${url}${item.name}`);
            } else {
                output.size += item.size;
                output.files.push(`${url}${item.name}`);
            }
        }
    }

    return output;
}

const run = async ({ url }) => {
    if(url.length == 0) return;

    const result = await walk({ url });

    console.log(`Found \t${result.files.length} files\t${result.folders.length} folders\t${url}`);

    if (result.files.length == 0 && result.folders.length == 0) {
        await download({
            url: url,
            dist: result.dist.replace(path.basename(url), ''),
        });
        return;
    }

    // download files
    for (const file of result.files) {
        if (file == url) {
            continue;
        }

        await download({
            url: file,
            dist: result.dist,
        });
    }

    // run folders
    for (const folder of result.folders) {
        if (folder == url) {
            continue;
        }

        await run({ url: folder });
    }

    console.log(`[${result.size}bytes] ${result.dist}`);
}

const main = async () => {
    const urls = mirrors();

    for (const url of urls) {
        await run({ url });
    }
}

main();