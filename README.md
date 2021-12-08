Change to using file instead of certificate store for use with github Actions
Thank you to [keytos](https://github.com/markeytos/code-sign-action) for providing a base for me to create this action. 

# Code sign a file

This action signs files that are supported by `signtool.exe` with a code signing certificate that takes in a password. This action only works on Windows and that means it should run on `windows-latest`.

## Inputs

### `certificate`

**Required** The base64 encoded certificate.

to get the base 64 encoded certificate of the PFX file, run the following in powershell:
```
$fileContentBytes = get-content 'YOURFILEPATH.pfx' -Encoding Byte
[System.Convert]::ToBase64String($fileContentBytes)
```

### `password`

**Required** Certificate Password. Used to add to the machine store. 

### `certificatesha1`

**Required** SHA1 hash for the certificate. You can obtain this from Microsoft Management Console after double clicking on your certificate (called Thumbprint). This and/or the `certificatename` is required for the signing to be successful. 

### `certificatename`

**Required** The name of the certificate. This and/or the `certificatesha1` is required for the signing to be successful. 

### `folder`

**Required** The folder that contains the libraries to sign.

### `recursive`

**Optional** Recursively search for DLL files.


### `description`

**Optional** Description of the signed content ([signtool /d flag](https://docs.microsoft.com/en-us/dotnet/framework/tools/signtool-exe#sign-command-options)).


### `timestampUrl`

**Optional** Url of the timestamp server.  Default is 'http://timestamp.digicert.com'

## Example usage

```
runs-on: windows-latest
steps:
  uses: inertiasystems/code-sign-action@v1
  with:
    certificate: '${{ secrets.CERTIFICATE }}'
    password: '${{ secrets.PASSWORD }}'
    certificatesha1: '${{ secrets.CERTHASH }}'
    certificatename: '${{ secrets.CERTNAME }}'
    description: 'My App'
    timestampUrl: 'http://timestamp.digicert.com'
    folder: 'files'
    recursive: true
```
