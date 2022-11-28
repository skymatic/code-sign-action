import * as core from '@actions/core';
import { promises as fs } from 'fs';
import path from 'path';
import util from 'util';
import { ChildProcess, exec } from 'child_process';
import { env } from 'process';

const asyncExec = util.promisify(exec);
const certificateFileName = env['TEMP'] + '\\certificate.pfx';

interface ChildProcessError extends Error {
    code : number;
    stdout : string;
    stderr : string;
}

function isChildProcessError(obj: any): obj is ChildProcessError {
    return obj && obj instanceof Error && 'code' in obj && 'stdout' in obj && 'stderr' in obj;
}

const signtoolFileExtensions = [
    '.dll', '.exe', '.sys', '.vxd',
    '.msix', '.msixbundle', '.appx',
    '.appxbundle', '.msi', '.msp',
    '.msm', '.cab', '.ps1', '.psm1'
];

async function createCertificatePfx() {
    const base64Certificate = core.getInput('certificate');
    const certificate = Buffer.from(base64Certificate, 'base64');
    if (certificate.length == 0) {
        throw new Error("Required certificate is an empty string")
    }
    console.log(`Writing ${certificate.length} bytes to ${certificateFileName}.`);
    await fs.writeFile(certificateFileName, certificate);
}

async function addCertificateToStore(){
    const password : string= core.getInput('password');
    if (password == ''){
        throw new Error("Required Password to store certificate is an empty string");
    }
    var command = `certutil -f -p ${password} -importpfx ${certificateFileName}`
    try {
        const { stdout } = await asyncExec(command);
        console.log(stdout);
    } catch( err) {
        if(isChildProcessError(err)) {
            console.log(err.stdout);
            console.error('Process to add certificate exited with code %d.', err.code);
            console.error(err.stderr)
        }
        throw err;
    }
}

async function signWithSigntool(signtool: string, fileName: string) {
    // see https://docs.microsoft.com/en-us/dotnet/framework/tools/signtool-exe
    var vitalParameterIncluded = false;
    var timestampUrl : string = core.getInput('timestampUrl');
    if (timestampUrl === '') {
        timestampUrl = 'http://timestamp.digicert.com';
    }
    var command = `"${signtool}" sign /sm /tr ${timestampUrl} /td SHA256 /fd SHA256`
    const sha1 : string= core.getInput('certificatesha1');
    if (sha1 != ''){
        command = command + ` /sha1 "${sha1}"`
        vitalParameterIncluded = true;
    }
    const name : string= core.getInput('certificatename');
    if (name != ''){
        vitalParameterIncluded = true;
        command = command + ` /n "${name}"`
    }
    const desc : string= core.getInput('description');
    if (desc != ''){
        vitalParameterIncluded = true;
        command = command + ` /d "${desc}"`
    }
    if (!vitalParameterIncluded){
        console.warn("You need to include a NAME or a SHA1 Hash for the certificate to sign with.")
    }
    command = command + ` ${fileName}`;
    console.log("Signing command: " + command);
    try {
        const { stdout } = await asyncExec(command);
        console.log(stdout);
    } catch(err) {
        if( isChildProcessError(err) ) {
            console.log(err.stdout);
            console.error('Process to sign file exited with code %d.', err.code);
            console.error(err.stderr);
        }
        throw err;
    }
}

async function trySignFile(signtool: string, fileName: string) {
    console.log(`Signing ${fileName}.`);
    const extension = path.extname(fileName);
    if (signtoolFileExtensions.includes(extension)) {
        await signWithSigntool(signtool, fileName);
    }
}

async function* getFiles(folder: string, recursive: boolean): any {
    const files = await fs.readdir(folder);
    for (const file of files) {
        const fullPath = `${folder}/${file}`;
        const stat = await fs.stat(fullPath);
        if (stat.isFile()) {
            const extension = path.extname(file);
            if (signtoolFileExtensions.includes(extension) || extension == '.nupkg')
                yield fullPath;
        }
        else if (stat.isDirectory() && recursive) {
            yield* getFiles(fullPath, recursive);
        }
    }
}

async function signFiles() {
    const folder = core.getInput('folder', { required: true });
    const recursive = core.getInput('recursive') == 'true';
    const signtool = await getSigntoolLocation()
    for await (const file of getFiles(folder, recursive)) {
        await trySignFile(signtool, file);
    }
}

/**
 * Searches the installed Windows SDKs for the most recent signtool.exe version
 * Taken from https://github.com/dlemstra/code-sign-action
 * @returns Path to most recent signtool.exe (x86 version)
 */
async function getSigntoolLocation() {
    const windowsKitsFolder = 'C:/Program Files (x86)/Windows Kits/10/bin/';
    const folders = await fs.readdir(windowsKitsFolder);
    let fileName = '';
    let maxVersion = 0;
    for (const folder of folders) {
        if (!folder.endsWith('.0')) {
            continue;
        }
        const folderVersion = parseInt(folder.replace(/\./g,''));
        if (folderVersion > maxVersion) {
            const signtoolFilename = `${windowsKitsFolder}${folder}/x64/signtool.exe`;
            try {
                const stat = await fs.stat(signtoolFilename);
                if (stat.isFile()) {
                    fileName = signtoolFilename;
                    maxVersion = folderVersion;
                }
            }
            catch {
                console.warn('Skipping %s due to error.', signtoolFilename);
            }
        }
    }
    if(fileName == '') {
        throw new Error('Unable to find signtool.exe in ' + windowsKitsFolder);
    }

    console.log(`Signtool location is ${fileName}.`);
    return fileName;
}

async function run() {
    try {
        await createCertificatePfx();
        await addCertificateToStore();
        await signFiles();
    } catch (err) {
        if (err instanceof Error) {
            core.setFailed(err);
        } else {
            core.setFailed(`Action failed with response: ${err}`);
        }
    }
}

run();
