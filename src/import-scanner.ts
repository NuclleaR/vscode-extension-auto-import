import { NodeUpload } from './node-upload';
import * as FS from 'fs';
import * as vscode from 'vscode';
import * as _ from 'lodash';

import { ImportDb } from './import-db';
import { AutoImport } from './auto-import';

export class ImportScanner {

    private scanStarted: Date;

    private scanEnded: Date;

    private showOutput: boolean;

    private filesToScan: string;

    private showNotifications: boolean;
    
    private higherOrderComponents: string;

    constructor(private config: vscode.WorkspaceConfiguration) {
        this.filesToScan = this.config.get<string>('filesToScan');
        this.showNotifications = this.config.get<boolean>('showNotifications');
        this.higherOrderComponents = this.config.get<string>('higherOrderComponents');
    }

    public scan(request: any): Thenable<any> {

        this.showOutput = request.showOutput ? request.showOutput : false;

        if (this.showOutput) {
            this.scanStarted = new Date();
        }

        return vscode.workspace
                .findFiles(this.filesToScan, '**/node_modules/**', 99999)
                .then((files) => this.processWorkspaceFiles(files))
                .then(() => 
                    vscode.commands
                        .executeCommand('extension.scanNodeModules')
                );

    }

    public edit(request: any): Thenable<any> {
        ImportDb.delete(request);
        this.loadFile(request.file, true);
        return new NodeUpload(vscode.workspace.getConfiguration('autoimport')).scanNodeModules();
    }

    public delete(request: any): Thenable<void> {
        ImportDb.delete(request);
        AutoImport.setStatusBar();
        return Promise.resolve();
    }


    private processWorkspaceFiles(files: vscode.Uri[]): Promise<void> {
        let pruned = files.filter((f) => {
            return f.fsPath.indexOf('typings') === -1 &&
                f.fsPath.indexOf('node_modules') === -1 &&
                f.fsPath.indexOf('.history') === -1 &&
                f.fsPath.indexOf('jspm_packages') === -1;
        });

        let readPromise: Promise<any> = Promise.resolve();
        pruned.forEach((f, i) => {
            readPromise = readPromise.then(() => this.loadFile(f, i === (pruned.length - 1)));
        });
        return readPromise;
    }

    private loadFile(file: vscode.Uri, last: boolean): Promise<any> {
        return new Promise((resolve) => {
            FS.readFile(file.fsPath, 'utf8', (err, data) => {
                if (err) {
                    resolve();
                    return console.log(err);
                }

                this.processFile(data, file);

                if (last) {
                    AutoImport.setStatusBar();
                }

                if (last && this.showOutput && this.showNotifications) {
                    this.scanEnded = new Date();

                    let str = `[AutoImport] cache creation complete - (${Math.abs(<any>this.scanStarted - <any>this.scanEnded)}ms)`;

                    vscode.window
                        .showInformationMessage(str);
                }

                resolve();
            });
        });
    }

    private processFile(data: any, file: vscode.Uri): void {
        //added code to support any other middleware that the component can  be nested in. 
        const regExp = new RegExp(`(export\\s?(default)?\\s?(class|interface|let|var|const|function)?) ((${this.higherOrderComponents}).+[, (])?(\\w+)`, "g");

        var matches = data.match(regExp);

        if (matches != null) {
            matches.forEach(m => {
                //this allows us to reliably gets the last string (not splitting on spaces)
                const mArr = regExp.exec(m);
                if(mArr === null){
                    //this is a weird situation that shouldn't ever happen. but does?
                    return;
                }
                const workingFile: string = mArr[mArr.length - 1];
                const isDefault = m.indexOf('default') !== -1;
                ImportDb.saveImport(workingFile, data, file, isDefault, null);
            })
        }
    }
}
