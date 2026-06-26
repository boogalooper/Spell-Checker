#target photoshop
/*
// BEGIN__HARVEST_EXCEPTION_ZSTRING
<javascriptresource>
<name>Spell checker</name>
<category>jazzy</category>
<enableinfo>true</enableinfo>
</javascriptresource>
// END__HARVEST_EXCEPTION_ZSTRING
*/
const ver = 0.1,
    UUID = 'c2007b83-5e0f-4d8f-8862-77b28358de34',
    API_HOST = '127.0.0.1',
    API_PORT_SEND = 6410,
    API_PORT_LISTEN = 6411,
    API_FILE = 'spell-checker',
    USER_DICTIONARY_FILE = 'spell-checker-user-dictionary.txt',
    INIT_DELAY = 15000,
    DETECTION_DELAY = 2000,
    PROGRESS_DELAY = 2500,
    PING_DELAY = 100,
    EXPAND_SMART_OBJECTS = true;

var fd = new pyApi(API_HOST, API_PORT_SEND, API_PORT_LISTEN, API_FILE),
    s2t = stringIDToTypeID,
    apl = new AM('application'),
    doc = new AM('document'),
    lr = new AM('layer'),
    str = new Locale();

isCancelled = false;

$.localize = true;

try {
    if (apl.getProperty('numberOfDocuments')) {
        main();
    } else {
        alert(toLocaleString(str.noOpenDocuments), toLocaleString(str.errTitle), true);
    }
} catch (e) {
    alert(e && e.message ? e.message : e, toLocaleString(str.errTitle), true);
}

function main() {
    var len = apl.getProperty('numberOfDocuments'),
        content = [],
        idx = doc.getProperty('itemIndex'),
        slice = 1 / len;

    app.doProgressSegmentTask(len, 0, len, "findLayers()");

    function findLayers() {
        for (var i = 1; i <= len; i++) {
            app.doProgressTask(slice, "workChunk(" + i + ")");
        }
        doc.select(idx, true);
    }

    if (!content.length) {
        alert(toLocaleString(str.noTextLayers));
        return;
    }

    fd.init();

    var result = fd.sendPayload('spell_check', content, getUserDictionaryFile().fsName);

    if (result && Number(result.errors_count) > 0) {
        var resultDesc = new ActionDescriptor();
        resultDesc.putString(s2t('result'), objectToJSON(result));
        app.putCustomOptions(UUID, resultDesc, false);
        //dialog(UUID);
        var bt = new BridgeTalk(),
            ph = BridgeTalk.getSpecifier('photoshop');

        bt.target = ph;
        bt.body = ""
            + "var API_FILE='" + jsString(API_FILE) + "';"
            + "var USER_DICTIONARY_FILE='" + jsString(USER_DICTIONARY_FILE) + "';"
            + "var ver=" + objectToJSON(ver) + ";"
            + "var toLocaleString =" + toLocaleString.toSource() + ";"
            + "var getUserDictionaryFile=" + getUserDictionaryFile.toSource() + ";"
            + "var normalizeDictionaryWord=" + normalizeDictionaryWord.toSource() + ";"
            + "var addWordToUserDictionary=" + addWordToUserDictionary.toSource() + ";"
            + "var Locale=" + Locale.toSource() + ";"
            + "var str=new Locale();"
            + "var f=" + dialog.toSource() + ";"
            + "f('" + UUID + "');";
        bt.send();
    } else {
        alert(toLocaleString(str.noErrors));
    }

    function workChunk(i) {
        activeDocument.suspendHistory(toLocaleString(str.findTextLayersHistory), 'doStuff();');

        function doStuff() {
            app.changeProgressText(toLocaleString(str.findTextLayersProgress));
            doc.select(i, true);

            var hst = activeDocument.activeHistoryState;

            if (EXPAND_SMART_OBJECTS) {
                while (doc.expandSmartObjects(i)) {
                    doc.convertSmartObjectToLayers();
                }
            }

            content = content.concat(doc.findAllTextLayers(i));
            activeDocument.activeHistoryState = hst;

            $.sleep(0);
        }
    }
}

function AM(target, order) {
    var s2t = stringIDToTypeID,
        t2s = typeIDToStringID,
        AR = ActionReference,
        AD = ActionDescriptor;

    target = target ? s2t(target) : null;

    this.getProperty = function (property, id, idxMode, descMode) {
        property = s2t(property);

        var ref = new AR();
        ref.putProperty(s2t('property'), property);

        if (id != undefined) {
            if (idxMode) {
                ref.putIndex(target, id);
            } else {
                ref.putIdentifier(target, id);
            }
        } else {
            ref.putEnumerated(target, s2t('ordinal'), order ? s2t(order) : s2t('targetEnum'));
        }

        try {
            return descMode ? executeActionGet(ref) : getDescValue(executeActionGet(ref), property);
        } catch (e) {
            return false;
        }
    };

    this.hasProperty = function (property, id, idxMode) {
        property = s2t(property);

        var ref = new AR();
        ref.putProperty(s2t('property'), property);

        if (id) {
            if (idxMode) {
                ref.putIndex(target, id);
            } else {
                ref.putIdentifier(target, id);
            }
        } else {
            ref.putEnumerated(target, s2t('ordinal'), s2t('targetEnum'));
        }

        try {
            return executeActionGet(ref).hasKey(property);
        } catch (e) {
            return false;
        }
    };

    this.descToObject = function (desc) {
        var obj = {};

        for (var i = 0; i < desc.count; i++) {
            var key = desc.getKey(i);
            obj[t2s(key)] = getDescValue(desc, key);
        }

        return obj;
    };

    function getDescValue(desc, property) {
        switch (desc.getType(property)) {
            case DescValueType.OBJECTTYPE: return { type: t2s(desc.getObjectType(property)), value: desc.getObjectValue(property) };
            case DescValueType.LISTTYPE: return desc.getList(property);
            case DescValueType.REFERENCETYPE: return desc.getReference(property);
            case DescValueType.BOOLEANTYPE: return desc.getBoolean(property);
            case DescValueType.STRINGTYPE: return desc.getString(property);
            case DescValueType.INTEGERTYPE: return desc.getInteger(property);
            case DescValueType.LARGEINTEGERTYPE: return desc.getLargeInteger(property);
            case DescValueType.DOUBLETYPE: return desc.getDouble(property);
            case DescValueType.ALIASTYPE: return desc.getPath(property);
            case DescValueType.CLASSTYPE: return desc.getClass(property);
            case DescValueType.UNITDOUBLE: return desc.getUnitDoubleValue(property);
            case DescValueType.ENUMERATEDTYPE: return { type: t2s(desc.getEnumerationType(property)), value: t2s(desc.getEnumerationValue(property)) };
            default: return undefined;
        }
    }

    this.expandSmartObjects = function (idx) {
        var ref = new ActionReference(),
            property = s2t('numberOfLayers');

        ref.putProperty(s2t('property'), property);
        ref.putEnumerated(s2t('document'), s2t('ordinal'), s2t('targetEnum'));

        var len = executeActionGet(ref).getInteger(property),
            lrs = [];

        for (var i = 1; i <= len; i++) {
            ref = new ActionReference();
            property = s2t('layerKind');

            ref.putProperty(s2t('property'), property);
            ref.putIndex(s2t('layer'), i);

            if (executeActionGet(ref).getInteger(property) == 5) {
                var locking = lr.getProperty('layerLocking', i, true);

                if (locking && !checkLocking(locking.value)) {
                    ref = new ActionReference();
                    property = s2t('smartObject');

                    ref.putProperty(s2t('property'), property);
                    ref.putIndex(s2t('layer'), i);

                    if (!executeActionGet(ref).getObjectValue(property).getBoolean(s2t('linked'))) {
                        lrs.push(i);
                    }
                }
            }
        }

        if (lrs.length) {
            for (i = 0; i < lrs.length; i++) {
                lr.select(lrs[i], true);

                ref = new ActionReference();
                ref.putIndex(s2t('layer'), lrs[i]);

                var desc = new ActionDescriptor(),
                    descLayer = new ActionDescriptor();

                desc.putReference(s2t('null'), ref);
                descLayer.putString(s2t('name'), '<parentID:' + lr.getProperty('layerID') + '>');
                desc.putObject(s2t('to'), s2t('layer'), descLayer);

                executeAction(s2t('set'), desc, DialogModes.NO);
            }

            ref = new ActionReference();

            for (i = 0; i < lrs.length; i++) {
                ref.putIndex(s2t('layer'), lrs[i]);
            }

            var selectDesc = new ActionDescriptor();
            selectDesc.putReference(s2t('target'), ref);
            executeAction(s2t('select'), selectDesc, DialogModes.NO);
        }

        return lrs.length;

        function checkLocking(lockingDesc) {
            var obj = lr.descToObject(lockingDesc);

            for (var a in obj) {
                if (obj[a]) return true;
            }

            return false;
        }
    };

    this.convertSmartObjectToLayers = function () {
        try {
            executeAction(s2t('placedLayerConvertToLayers'), undefined, DialogModes.NO);
            return true;
        } catch (e) {
            return false;
        }
    };

    this.close = function (save) {
        save = save != true ? s2t('no') : s2t('yes');

        var desc = new AD();
        desc.putEnumerated(s2t('saving'), s2t('yesNo'), save);
        executeAction(s2t('close'), desc, DialogModes.NO);
    };

    this.findAllTextLayers = function (idx) {
        var ref = new ActionReference(),
            property = s2t('numberOfLayers');

        ref.putProperty(s2t('property'), property);
        ref.putIndex(s2t('document'), idx);

        var len = executeActionGet(ref).getInteger(property),
            lrs = [],
            parent = doc.getProperty('documentID');

        for (var i = 1; i <= len; i++) {
            ref = new ActionReference();
            property = s2t('layerKind');

            ref.putProperty(s2t('property'), property);
            ref.putIndex(s2t('layer'), i);

            if (executeActionGet(ref).getInteger(property) == 3) {
                ref = new ActionReference();
                property = s2t('textKey');

                ref.putProperty(s2t('property'), property);
                ref.putIndex(s2t('layer'), i);

                var content = executeActionGet(ref)
                    .getObjectValue(property)
                    .getString(s2t('textKey'))
                    .replace(/[\r\n\t]+/g, ' ')
                    .replace(/\u00A0/g, ' ')
                    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
                    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
                    .replace(/[«»„“”"'`´]/g, ' ')
                    .replace(/[—–\-]+/g, ' ')
                    .replace(/[(){}\[\]<>]/g, ' ')
                    .replace(/[,:;!?…]/g, ' ')
                    .replace(/[\\\/|]/g, ' ')
                    .replace(/[•·▪●◦]/g, ' ')
                    .replace(/[^\S\r\n]+/g, ' ')
                    .replace(/\s+/g, ' ');

                var pth = [],
                    layerName = String(lr.getProperty('name', i, true) || ''),
                    parentName = layerName.match(/<parentID:(\d+)>/);

                if (parentName && parentName[1]) {
                    pth.push(Number(parentName[1]));
                }

                var parentID = lr.getProperty('parentLayerID', i, true);

                while (parentID != -1 && parentID !== false) {
                    var currentName = String(lr.getProperty('name', parentID) || ''),
                        match = currentName.match(/<parentID:(\d+)>/);

                    if (match && match[1]) {
                        var id = Number(match[1]);
                        parentID = lr.getProperty('parentLayerID', parentID);
                        pth.push(id);
                    } else {
                        parentID = -1;
                    }
                }

                lrs.push({
                    content: content,
                    id: lr.getProperty('layerID', i, true),
                    path: pth,
                    parent: parent
                });
            }
        }

        return lrs;
    };

    this.select = function (idx, idxMode) {
        var ref = new ActionReference();

        if (idxMode) {
            ref.putIndex(target, idx);
        } else {
            ref.putIdentifier(target, idx);
        }

        var desc = new ActionDescriptor();
        desc.putReference(s2t('target'), ref);
        executeAction(s2t('select'), desc, DialogModes.NO);
    };
}

function pyApi(apiHost, portSend, portListen, apiFile) {
    this.init = function () {
        var result = sendMessage({ type: 'handshake', message: '' }, PING_DELAY, true, true);

        if (!result) {
            var f = findPythonModule(apiFile);

            if (!f || !f.exists) {
                throw new Error(toLocaleString(str.errModule));
            }

            f.execute();

            result = sendMessage({}, INIT_DELAY, false, true, str.starting);

            if (!result) {
                throw new Error(toLocaleString(str.errConnection));
            }

            if (result.type == 'error') {
                throw new Error(result.message);
            }
        }

        return true;
    };

    this.sendPayload = function (type, payload) {
        var result = sendMessage({ type: type, message: payload, dict: getUserDictionaryFile().fsName }, DETECTION_DELAY, true, true);

        if (result) {
            if (result.type == 'answer') return result.message;
            if (result.type == 'error') throw new Error(result.message);
        } else {
            throw new Error(toLocaleString(str.noAnswer));
        }

        return null;
    };

    function findPythonModule(apiFile) {
        var scriptFolder = new File($.fileName).parent,
            candidates = [
                new File(scriptFolder.fsName + '/' + apiFile + '.py'),
                new File(scriptFolder.fsName + '/' + apiFile + '.pyw'),
                new File(scriptFolder.fsName + '/lib/' + apiFile + '.py'),
                new File(scriptFolder.fsName + '/lib/' + apiFile + '.pyw')
            ];

        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i].exists) {
                return candidates[i];
            }
        }

        return null;
    }

    function sendMessage(o, delay, sendData, getData, title) {
        delay = delay ? delay : INIT_DELAY;

        var listener = null,
            progressWindow = null,
            bar = null,
            t1 = 0,
            t2 = 0,
            t3 = 0;

        if (getData) {
            listener = new Socket();

            if (!listener.listen(portListen, 'UTF-8')) {
                return null;
            }

            if (title) {
                progressWindow = new Window('palette', toLocaleString(title));
                bar = progressWindow.add('progressbar', undefined, 0, PROGRESS_DELAY);
                bar.preferredSize = [350, 20];
                bar.value = 0;
                progressWindow.show();
            }

            t1 = (new Date()).getTime();
            t3 = t1;
        }

        if (sendData) {
            var sender = new Socket();

            if (sender.open(apiHost + ':' + portSend, 'UTF-8')) {
                sender.writeln(objectToJSON(o));
                sender.close();
            } else {
                if (listener) listener.close();
                return null;
            }
        }

        if (!getData) {
            return true;
        }

        for (; ;) {
            t2 = (new Date()).getTime();

            if (t2 - t1 > delay) {
                if (listener) listener.close();
                if (progressWindow) progressWindow.close();
                return null;
            }

            if (progressWindow && t2 - t3 > 100) {
                t3 = t2;

                if (bar.value >= PROGRESS_DELAY) {
                    bar.value = 0;
                }

                bar.value = bar.value + 100;
                progressWindow.update();
            }

            var answer = listener.poll();

            if (answer != null) {
                var a = null;

                try {
                    a = eval('(' + answer.readln() + ')');
                } catch (e) {
                    a = null;
                }

                if (progressWindow) progressWindow.close();

                answer.close();

                if (listener) listener.close();

                return a;
            }

            $.sleep(1);
        }
    }
}

function objectToJSON(obj) {
    if (obj === null || obj === undefined) {
        return 'null';
    }

    var objType = typeof obj;

    if (objType == 'string') {
        return '"' + jsString(obj) + '"';
    }

    if (objType == 'number') {
        return isFinite(obj) ? String(obj) : 'null';
    }

    if (objType == 'boolean') {
        return obj ? 'true' : 'false';
    }

    if (obj instanceof Array) {
        var arr = [];

        for (var i = 0; i < obj.length; i++) {
            arr.push(objectToJSON(obj[i]));
        }

        return '[' + arr.join(',') + ']';
    }

    var result = [];

    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            result.push('"' + jsString(key) + '":' + objectToJSON(obj[key]));
        }
    }

    return '{' + result.join(',') + '}';
}

function jsString(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t')
        .replace(/\f/g, '\\f')
        .replace(/\x08/g, '\\b');
}

function toLocaleString(value) {
    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value == 'string') {
        return value;
    }

    var locale = String($.locale || '').toLowerCase();

    if (locale.indexOf('ru') == 0 && value.ru) {
        return value.ru;
    }

    if (value.en) {
        return value.en;
    }

    for (var key in value) {
        return value[key];
    }

    return String(value);
}

function getUserDictionaryFile() {
    return new File(app.preferencesFolder.fsName + '/' + USER_DICTIONARY_FILE);
}

function normalizeDictionaryWord(word) {
    return String(word || '')
        .replace(/^\uFEFF/, '')
        .replace(/^\s+|\s+$/g, '')
        .replace(/\r]/g, '')
        .replace(/\n]/g, '')
        .toLowerCase();
}

function addWordToUserDictionary(word) {
    var normalizedWord = normalizeDictionaryWord(word),
        dictionaryFile = getUserDictionaryFile(),
        dictionaryContent = '';

    if (!normalizedWord) {
        return { added: false, exists: false, word: normalizedWord, empty: true };
    }

    if (dictionaryFile.exists) {
        dictionaryFile.encoding = 'UTF-8';

        if (!dictionaryFile.open('r')) {
            throw new Error(toLocaleString(str.dictionaryReadError));
        }

        dictionaryContent = dictionaryFile.read();
        dictionaryFile.close();

        var lines = dictionaryContent.split(/\r\n|\r|\n/);

        for (var i = 0; i < lines.length; i++) {
            if (normalizeDictionaryWord(lines[i]) == normalizedWord) {
                return { added: false, exists: true, word: normalizedWord };
            }
        }
    }

    dictionaryFile.encoding = 'UTF-8';
    dictionaryFile.lineFeed = 'Windows';

    if (!dictionaryFile.open('a')) {
        throw new Error(toLocaleString(str.dictionaryWriteError));
    }

    dictionaryFile.writeln(normalizedWord);
    dictionaryFile.close();

    return { added: true, exists: false, word: normalizedWord };
}

function Locale() {
    this.errTitle = { ru: 'Ошибка', en: 'Error' };
    this.errModule = { ru: 'Модуль ' + API_FILE + ' не найден! Убедитесь, что он находится в той же папке, что и скрипт, или в папке lib.', en: 'Module ' + API_FILE + ' was not found. Make sure it is in the same folder as the script or in the lib folder.' };
    this.errConnection = { ru: 'Невозможно установить соединение c ' + API_FILE, en: 'Unable to establish a connection with ' + API_FILE };
    this.starting = { ru: 'Запуск модуля Python...', en: 'Starting Python module...' };
    this.noAnswer = { ru: 'Модуль проверки орфографии недоступен!', en: 'The spell checker is unavailable!' };
    this.noOpenDocuments = { ru: 'Нет открытых документов.', en: 'There are no open documents.' };
    this.noTextLayers = { ru: 'Текстовые слои не найдены.', en: 'No text layers found.' };
    this.noErrors = { ru: 'Проверка завершена. В открытых документах орфографические ошибки не найдены.', en: 'Spell check complete. No spelling errors were found in the open documents.' };
    this.findTextLayersProgress = { ru: 'Поиск текстовых слоев...', en: 'Find text layers...' };
    this.findTextLayersHistory = { ru: 'Поиск текстовых слоев', en: 'Find text layers' };
    this.dialogTitle = { ru: 'Проверка орфографии', en: 'Spell Checker' };
    this.done = { ru: 'Готово', en: 'Done' };
    this.goToFragment = { ru: 'Перейти к фрагменту', en: 'Go to fragment' };
    this.dictionaryButtonHint = { ru: 'Добавить слово в пользовательский словарь', en: 'Add word to the user dictionary' };
    this.dictionaryButtonAddedHint = { ru: 'Слово уже добавлено в пользовательский словарь', en: 'The word has already been added to the user dictionary' };
    this.dictionaryTitle = { ru: 'Пользовательский словарь', en: 'User dictionary' };
    this.dictionaryWordAdded = { ru: 'Слово добавлено', en: 'Word added' };
    this.dictionaryWordAlreadyExists = { ru: 'Слово уже есть в словаре!', en: 'The word is already in the dictionary!' };
    this.dictionaryEmptyWord = { ru: 'Не удалось добавить слово: слово пустое.', en: 'The word could not be added because it is empty.' };
    this.dictionaryReadError = { ru: 'Не удалось прочитать пользовательский словарь:', en: 'Could not read the user dictionary:' };
    this.dictionaryWriteError = { ru: 'Не удалось записать пользовательский словарь:', en: 'Could not write to the user dictionary:' };
}

function dialog(UUID) {
    var s2t = stringIDToTypeID,
        optionsDesc = new ActionDescriptor();

    try {
        optionsDesc = getCustomOptions(UUID);
    } catch (e) { }

    if (!optionsDesc.count) {
        return;
    }

    var serializedResult = optionsDesc.getString(s2t('result')),
        result = eval('(' + serializedResult + ')'),
        win = new Window('palette');

    win.text = toLocaleString(str.dialogTitle) + ' v' + ver;
    win.orientation = 'column';
    win.alignChildren = ['fill', 'top'];
    win.spacing = 5;
    win.margins = 15;

    for (var i = 0; i < result.errors.length; i++) {
        addWord(result.errors[i]);
    }

    var grOk = win.add('group', undefined, { name: 'grOk' });
    grOk.orientation = 'row';
    grOk.alignChildren = ['center', 'center'];
    grOk.spacing = 10;
    grOk.margins = 0;

    var ok = grOk.add('button', undefined, undefined, { name: 'ok' });
    ok.text = toLocaleString(str.done);

    ok.onClick = function () {
        win.close();
    };

    win.onShow = function () {
        var screen = activeView(undefined, undefined, true);
        win.location = [screen[3] - win.size.width - 20, screen[2] - win.size.height - 20];
    };

    win.show();

    function addWord(w) {
        var cur = 1,
            group = win.add('group');

        group.orientation = 'row';
        group.alignChildren = ['left', 'center'];
        group.spacing = 0;
        group.margins = 0;

        var count = group.add('statictext');
        count.preferredSize = [30, 20];

        var word = group.add('button');
        word.preferredSize.width = 350;
        word.helpTip = toLocaleString(str.goToFragment);

        var add = group.add('button');
        add.text = '📖';
        add.preferredSize = [20, 20];
        add.helpTip = toLocaleString(str.dictionaryButtonHint);

        add.onClick = function () {
            try {
                var dictionaryResult = addWordToUserDictionary(w.word),
                    message = '';

                if (dictionaryResult.empty) {
                    alert(toLocaleString(str.dictionaryEmptyWord), toLocaleString(str.dictionaryTitle), true);
                    return;
                }

                if (dictionaryResult.exists) {
                    message = toLocaleString(str.dictionaryWordAlreadyExists)
                } else {
                    message = toLocaleString(str.dictionaryWordAdded)
                }

                alert(message, toLocaleString(str.dictionaryTitle), false);

                add.enabled = false;
                add.helpTip = toLocaleString(str.dictionaryButtonAddedHint);
            } catch (e) {
                alert(e && e.message ? e.message : e, toLocaleString(str.errTitle), true);
            }
        };

        word.text = w.suggestion ? (w.word + ' → ' + w.suggestion) : w.word;
        renew(cur, w.count, count);

        word.onClick = function () {
            renew(cur, w.count, count);

            var fragment = w.fragments[cur - 1];

            select(s2t('document'), Number(fragment.parent));

            if (fragment.path.length) {
                for (var i = 0; i < fragment.path.length; i++) {
                    select(s2t('layer'), Number(fragment.path[i]));
                    executeAction(s2t('placedLayerEditContents'), undefined, DialogModes.NO);
                }
            }

            var id = null;

            if (fragment.path.length == 0) {
                id = Number(fragment.id);
                select(s2t('layer'), id);
            } else {
                id = findTextLayer(w.word);
            }

            if (id) {
                activeView(id, 0.7);
            }

            cur++;

            if (cur > Number(w.count)) {
                cur = 1;
            }

            currentTool = 'typeCreateOrEditTool';
        };

        function renew(cur, total, text) {
            text.text = cur + '/' + total;
        }

        function select(target, id) {
            var ref = new ActionReference();
            ref.putIdentifier(target, id);

            var desc = new ActionDescriptor();
            desc.putReference(s2t('target'), ref);

            executeAction(s2t('select'), desc, DialogModes.NO);
        }
    }

    function activeView(layerID, zoom, returnScreenCoordinates) {
        var ref = new ActionReference(),
            property = s2t('viewInfo');

        ref.putProperty(s2t('property'), property);
        ref.putEnumerated(s2t('document'), s2t('ordinal'), s2t('targetEnum'));

        var viewBounds = executeActionGet(ref)
            .getObjectValue(property)
            .getObjectValue(s2t('activeView'))
            .getObjectValue(s2t('globalBounds')),
            docW = viewBounds.getDouble(s2t('right')) - viewBounds.getDouble(s2t('left')),
            docH = viewBounds.getDouble(s2t('bottom')) - viewBounds.getDouble(s2t('top'));

        if (returnScreenCoordinates) {
            return [
                viewBounds.getDouble(s2t('top')),
                viewBounds.getDouble(s2t('left')),
                viewBounds.getDouble(s2t('bottom')),
                viewBounds.getDouble(s2t('right'))
            ];
        }

        ref = new ActionReference();
        property = s2t('bounds');

        ref.putProperty(s2t('property'), property);
        ref.putIdentifier(s2t('layer'), layerID);

        var lrBounds = executeActionGet(ref).getObjectValue(property),
            x = lrBounds.getUnitDoubleValue(s2t('left')) + lrBounds.getUnitDoubleValue(s2t('width')) / 2,
            y = lrBounds.getUnitDoubleValue(s2t('top')) + lrBounds.getUnitDoubleValue(s2t('height')) / 2,
            w = lrBounds.getUnitDoubleValue(s2t('width')),
            h = lrBounds.getUnitDoubleValue(s2t('height')),
            k = Math.min(docW / w, docH / h) * (zoom ? zoom : 1),
            zoomDesc = new ActionDescriptor();

        zoomDesc.putUnitDouble(s2t('zoom'), s2t('percentUnit'), k);
        setProperty('document', 'zoom', zoomDesc);

        var centerDesc = new ActionDescriptor();

        centerDesc.putUnitDouble(s2t('horizontal'), s2t('distanceUnit'), x * k);
        centerDesc.putUnitDouble(s2t('vertical'), s2t('distanceUnit'), y * k);
        setProperty('document', 'center', centerDesc);

        function setProperty(target, propertyName, descValue) {
            var propertyRef = new ActionReference(),
                propertyID = s2t(propertyName);

            propertyRef.putProperty(s2t('property'), propertyID);
            propertyRef.putEnumerated(s2t(target), s2t('ordinal'), s2t('targetEnum'));

            var desc = new ActionDescriptor();
            desc.putReference(s2t('null'), propertyRef);
            desc.putObject(s2t('to'), propertyID, descValue);

            executeAction(s2t('set'), desc, DialogModes.NO);
        }
    }

    function findTextLayer(content) {
        var ref = new ActionReference(),
            property = s2t('numberOfLayers');

        ref.putProperty(s2t('property'), property);
        ref.putEnumerated(s2t('document'), s2t('ordinal'), s2t('targetEnum'));

        var len = executeActionGet(ref).getInteger(property);

        for (var i = 1; i <= len; i++) {
            ref = new ActionReference();
            property = s2t('layerKind');

            ref.putProperty(s2t('property'), property);
            ref.putIndex(s2t('layer'), i);

            if (executeActionGet(ref).getInteger(property) == 3) {
                ref = new ActionReference();
                property = s2t('textKey');

                ref.putProperty(s2t('property'), property);
                ref.putIndex(s2t('layer'), i);

                var text = executeActionGet(ref).getObjectValue(property).getString(property);

                if (text.indexOf(content) != -1) {
                    ref = new ActionReference();
                    property = s2t('layerID');

                    ref.putProperty(s2t('property'), property);
                    ref.putIndex(s2t('layer'), i);

                    return executeActionGet(ref).getInteger(property);
                }
            }
        }

        return null;
    }
}
