#target photoshop

const ver = 0.0,
    UUID = 'c2007b83-5e0f-4d8f-8862-77b28358de34',
    API_HOST = '127.0.0.1',
    API_PORT_SEND = 6410,
    API_PORT_LISTEN = 6411,
    API_FILE = 'spell-checker',
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
//try {
if (apl.getProperty('numberOfDocuments')) main()
//} catch (e) { alert(e, 'Error', true) }
function main() {
    var len = apl.getProperty('numberOfDocuments'),
        content = [],
        idx = doc.getProperty('itemIndex'),
        slice = 1 / len;

    app.doProgressSegmentTask(len, 0, len, "findLayers()");

    function findLayers() {
        for (var i = 1; i <= len; i++) {
            app.doProgressTask(slice, "workChunk('Find text layers... ', i)")
        }
        doc.select(idx, true);
    }

    if (content) {
        //activeDocument.suspendHistory('Check spelling', 'function (){};');
        fd.init();
        var result = fd.sendPayload('spell_check', content);
        $.writeln(result.toSource())
        if (result && result.errors_count) {
            var d = new ActionDescriptor();
            d.putString(s2t('result'), objectToJSON(result));
            app.putCustomOptions(UUID, d, false);
            //dialog();
            var bt = new BridgeTalk(),
                ph = BridgeTalk.getSpecifier('photoshop');
            bt.target = ph;
            bt.body = "var f=" + dialog.toSource() + ";f('" + UUID + "');";
            bt.send();
        } else { alert('No errors!') }
    }
    function workChunk(text, i) {
        activeDocument.suspendHistory('Find text layers', 'doStuff();')
        function doStuff() {
            app.changeProgressText(text);
            doc.select(i, true)
            var hst = activeDocument.activeHistoryState;
            if (EXPAND_SMART_OBJECTS) {
                while (doc.expandSmartObjects(i)) {
                    doc.convertSmartObjectToLayers();
                }
            }
            var tmp = [];
            tmp = content.concat(doc.findAllTextLayers(i));
            content = tmp;
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
        (r = new AR).putProperty(s2t('property'), property);
        id != undefined ? (idxMode ? r.putIndex(target, id) : r.putIdentifier(target, id)) :
            r.putEnumerated(target, s2t('ordinal'), order ? s2t(order) : s2t('targetEnum'));
        try { return descMode ? executeActionGet(r) : getDescValue(executeActionGet(r), property) } catch (e) { return false };
    }
    this.hasProperty = function (property, id, idxMode) {
        property = s2t(property);
        (r = new AR).putProperty(s2t('property'), property);
        id ? (idxMode ? r.putIndex(target, id) : r.putIdentifier(target, id))
            : r.putEnumerated(target, s2t('ordinal'), s2t('targetEnum'));
        try { return executeActionGet(r).hasKey(property) } catch (e) { return false }
    }
    this.descToObject = function (d) {
        var o = {}
        for (var i = 0; i < d.count; i++) {
            var k = d.getKey(i)
            o[t2s(k)] = getDescValue(d, k)
        }
        return o
    }
    function getDescValue(d, p) {
        switch (d.getType(p)) {
            case DescValueType.OBJECTTYPE: return { type: t2s(d.getObjectType(p)), value: d.getObjectValue(p) };
            case DescValueType.LISTTYPE: return d.getList(p);
            case DescValueType.REFERENCETYPE: return d.getReference(p);
            case DescValueType.BOOLEANTYPE: return d.getBoolean(p);
            case DescValueType.STRINGTYPE: return d.getString(p);
            case DescValueType.INTEGERTYPE: return d.getInteger(p);
            case DescValueType.LARGEINTEGERTYPE: return d.getLargeInteger(p);
            case DescValueType.DOUBLETYPE: return d.getDouble(p);
            case DescValueType.ALIASTYPE: return d.getPath(p);
            case DescValueType.CLASSTYPE: return d.getClass(p);
            case DescValueType.UNITDOUBLE: return (d.getUnitDoubleValue(p));
            case DescValueType.ENUMERATEDTYPE: return { type: t2s(d.getEnumerationType(p)), value: t2s(d.getEnumerationValue(p)) };
            default: break;
        };
    }
    this.expandSmartObjects = function (idx) {
        (r = new ActionReference()).putProperty(s2t('property'), p = s2t('numberOfLayers'));
        r.putEnumerated(s2t('document'), s2t('ordinal'), s2t('targetEnum'));
        var len = executeActionGet(r).getInteger(p), lrs = [];
        for (var i = 1; i <= len; i++) {
            var r = new ActionReference()
            r.putProperty(s2t('property'), p = s2t('layerKind'));
            r.putIndex(s2t('layer'), i);
            // r.putIndex(s2t('document'), idx);
            if (executeActionGet(r).getInteger(p) == 5) {
                var locking = lr.getProperty('layerLocking', i, true).value;
                if (!checkLocking(locking)) {
                    var r = new ActionReference();
                    r.putProperty(s2t('property'), p = s2t('smartObject'));
                    r.putIndex(s2t('layer'), i);
                    // r.putIndex(s2t('document'), idx);
                    if (!executeActionGet(r).getObjectValue(p).getBoolean(s2t('linked'))) lrs.push(i)
                }
            }
        }
        if (lrs.length) {
            for (var i = 0; i < lrs.length; i++) {
                lr.select(lrs[i], true);
                (r = new ActionReference()).putIndex(s2t('layer'), lrs[i]);
                (d = new ActionDescriptor()).putReference(s2t('null'), r);
                (d1 = new ActionDescriptor()).putString(s2t('name'), '<parentID:' + lr.getProperty('layerID') + '>');
                d.putObject(s2t('to'), s2t('layer'), d1);
                executeAction(s2t('set'), d, DialogModes.NO);
            }

            var r = new ActionReference();
            for (var i = 0; i < lrs.length; i++) { r.putIndex(s2t('layer'), lrs[i]); }
            //r.putIndex(s2t('document'), idx);
            (d = new ActionDescriptor()).putReference(s2t('target'), r);
            executeAction(s2t('select'), d, DialogModes.NO);
        }
        return lrs.length;

        function checkLocking(d) {
            var o = lr.descToObject(d);
            for (var a in o) if (o[a]) return true
            return false
        }
    }
    this.convertSmartObjectToLayers = function () {
        try { executeAction(s2t('placedLayerConvertToLayers'), undefined, DialogModes.NO); return true } catch (e) { return false }
    }
    this.close = function (save) {
        save = save != true ? s2t("no") : s2t("yes");
        (d = new AD).putEnumerated(s2t("saving"), s2t("yesNo"), save);
        executeAction(s2t("close"), d, DialogModes.NO);
    }
    this.findAllTextLayers = function (idx) {
        (r = new ActionReference()).putProperty(s2t('property'), p = s2t('numberOfLayers'));
        r.putIndex(s2t('document'), idx);
        var len = executeActionGet(r).getInteger(p), lrs = [],
            parent = doc.getProperty('documentID');
        for (var i = 1; i <= len; i++) {
            r = new ActionReference();
            r.putProperty(s2t('property'), p = s2t('layerKind'));
            r.putIndex(s2t('layer'), i);
            // r.putIndex(s2t('document'), idx);
            if (executeActionGet(r).getInteger(p) == 3) {
                r = new ActionReference();
                r.putProperty(s2t('property'), p = s2t('textKey'));
                r.putIndex(s2t('layer'), i);
                //  r.putIndex(s2t('document'), idx);
                var content = executeActionGet(r)
                    .getObjectValue(p)
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
                    .replace(/\s+/g, ' ')
                var pth = [],
                    parentName = lr.getProperty('name', i, true).match(/<parentID:(\d+)>/);
                if (parentName && parentName[1]) pth.push(Number(parentName[1]));
                var parentID = lr.getProperty('parentLayerID', i, true);
                while (parentID != -1) {
                    var parentName = lr.getProperty('name', parentID).match(/<parentID:(\d+)>/);
                    if (parentName && parentName[1]) {
                        var id = Number(parentName[1])
                        parentID = lr.getProperty('parentLayerID', parentID);
                        pth.push(id);
                    } else parentID = -1;
                }
                lrs.push({ content: content, id: lr.getProperty('layerID', i, true), path: pth, parent: parent });
            }
        }
        return lrs;
    }
    this.select = function (idx, idxMode) {
        var r = new ActionReference();
        idxMode ? r.putIndex(target, idx) : r.putIdentifier(target, idx);
        (d = new ActionDescriptor()).putReference(s2t('target'), r);
        executeAction(s2t('select'), d, DialogModes.NO);
    }
}
function pyApi(apiHost, portSend, portListen, apiFile) {
    this.init = function () {
        var result = sendMessage({ type: 'handshake', message: '' }, PING_DELAY, true, true)
        if (!result) {
            var f = new File(new File(($.fileName)).path + '/' + apiFile + '.py')
            if (!f.exists) f = new File(f.fsName + 'w');
            if (!f.exists) f = new File(new File(($.fileName)).path + '/lib/' + apiFile + '.py')
            if (!f.exists) f = new File(apiFile.fsName + 'w');
            if (!f.exists) throw new Error(str.errModule)
            f.execute();
            var result = sendMessage({}, INIT_DELAY, false, true, str.starting);
            if (!result) throw new Error(str.errConnection)
            if (result.type == 'error') throw new Error(result.message)
        }
        return true
    }
    this.sendPayload = function (type, payload) {
        // $.writeln(payload.toSource())
        var result = sendMessage({ type: type, message: payload }, DETECTION_DELAY, true, true)
        if (result) {
            if (result.type == 'answer') return result['message'];
            if (result.type == 'error') throw new Error(result.message)
        } else throw new Error(str.noAnswer)
        return null;
    }
    function sendMessage(o, delay, sendData, getData, title) {
        delay = delay ? delay : INIT_DELAY;
        var listener = null;
        var t1 = 0, t2 = 0, t3 = 0;
        if (getData) {
            listener = new Socket();
            if (!listener.listen(portListen, 'UTF-8')) {
                return null;
            }
            if (title) {
                var w = new Window('palette', title),
                    bar = w.add('progressbar', undefined, 0, PROGRESS_DELAY);
                bar.preferredSize = [350, 20];
                bar.value = 0;
                w.show();
            }
            t1 = (new Date).getTime();
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
        if (!getData) return true;
        for (; ;) {
            t2 = (new Date).getTime();
            if (t2 - t1 > delay) {
                if (listener) listener.close();
                if (title) w.close();
                return null;
            }
            if (title && t2 - t3 > 100) {
                t3 = t2
                if (bar.value >= PROGRESS_DELAY) bar.value = 0;
                bar.value = bar.value + 100;
                w.update();
            }
            var answer = listener.poll();
            if (answer != null) {
                try { var a = eval('(' + answer.readln() + ')'); } catch (e) { a = null; }
                if (title) { w.close() }
                answer.close();
                if (listener) listener.close();
                return a;
            }
            $.sleep(1);
        }
    }
};
function objectToJSON(obj) {
    if (obj === null) {
        return 'null';
    }
    if (typeof obj !== 'object') {
        return '"' + obj + '"';
    }
    if (obj instanceof Array) {
        var arr = [];
        for (var i = 0; i < obj.length; i++) {
            arr.push(objectToJSON(obj[i]));
        }
        return '[' + arr.join(',') + ']';
    }
    var keys = [];
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            keys.push(key);
        }
    }
    var result = [];
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = objectToJSON(obj[key]);
        result.push('"' + key + '":' + value);
    }
    return '{' + result.join(',') + '}';
}
function Locale() {
    this.errModule = { ru: 'Модуль ' + API_FILE + ' не найден! Убедитесь, что он находится в той же папке что и скрипт!', en: 'Module ' + API_FILE + ' not found! Make sure it in the same folder as the script!' }
    this.errConnection = { ru: 'Невозможно установить соединение c ' + API_FILE, en: 'Impossible to establish a connection with ' + API_FILE }
    this.starting = { ru: 'Запуск модуля python...', en: 'Starting python module...' }
    this.noAnswer = { ru: 'Модуль проверки орфографии недоступен!', en: 'The spell checker is unavailable!' }
}
function dialog(UUID) {
    var s2t = stringIDToTypeID,
        t2s = typeIDToStringID,
        d = new ActionDescriptor();
    try { d = getCustomOptions(UUID) } catch (e) { };
    if (!d.count) return;
    var s = d.getString(s2t('result')),
        o = eval('(' + s + ')');
    var d = new Window('palette');
    d.text = 'Spell Checker';
    d.orientation = 'column';
    d.alignChildren = ['fill', 'top'];
    d.spacing = 5;
    d.margins = 15;
    for (var i = 0; i < o.errors.length; i++) { addWord(o.errors[i]); };
    function addWord(w) {
        var cur = 1,
            g = d.add('group');
        g.orientation = 'row';
        g.alignChildren = ['left', 'center'];
        g.spacing = 0;
        g.margins = 0;
        var count = g.add('statictext');
        count.preferredSize = [30, 20];
        var word = g.add('button');
        word.preferredSize.width = 350;
        var add = g.add('button');
        add.text = '📖';
        add.preferredSize = [20, 20];

        word.text = w.word + ' (' + w.suggestion + '?)';
        renew(cur, w.count, count);

        word.onClick = function () {
            renew(cur, w.count, count);
            var fragment = w.fragments[cur - 1];
            select(s2t('document'), Number(fragment.parent));

            if (fragment.path.length) {
                for (var i = 0; i < fragment.path.length; i++) {
                    select(s2t('layer'), Number(fragment.path[i]));
                    executeAction(s2t('placedLayerEditContents'), undefined, DialogModes.NO);
                };
            };
            var id = null;
            if (fragment.path.length == 0) {
                id = Number(fragment.id);
                select(s2t('layer'), id);
            } else {
                id = findTextLayer(w.word);
            };
            if (id) activeView(id, 0.7);
            cur++;
            if (cur > Number(w.count)) cur = 1;
            currentTool = 'typeCreateOrEditTool';
        };
        function renew(cur, total, text) {
            text.text = cur + '/' + total;
        };
        function select(target, id) {
            var r = new ActionReference();
            r.putIdentifier(target, id);
            var d = new ActionDescriptor();
            d.putReference(s2t('target'), r);
            executeAction(s2t('select'), d, DialogModes.NO);
        };

    };

    var grOk = d.add('group', undefined, { name: 'grOk' });
    grOk.orientation = 'row';
    grOk.alignChildren = ['center', 'center'];
    grOk.spacing = 10;
    grOk.margins = 0;

    var ok = grOk.add('button', undefined, undefined, { name: 'ok' });
    ok.text = 'Done';

    ok.onClick = function () { d.close(); };

    d.onShow = function () {
        var screen = activeView(undefined, undefined, true)

        d.location = [screen[3] - d.size.width - 20, screen[2] - d.size.height - 20];
    }


    d.show();

    function activeView(layerID, zoom, returnScreenCoordinates) {
        var r = new ActionReference();
        r.putProperty(s2t('property'), p = s2t('viewInfo'));
        r.putEnumerated(s2t('document'), s2t('ordinal'), s2t('targetEnum'));

        var activeView = executeActionGet(r).getObjectValue(p).getObjectValue(s2t('activeView')).getObjectValue(s2t('globalBounds')),
            docW = activeView.getDouble(s2t('right')) - activeView.getDouble(s2t('left')),
            docH = activeView.getDouble(s2t('bottom')) - activeView.getDouble(s2t('top'));

        if (returnScreenCoordinates) {
            return ([activeView.getDouble(s2t('top')), activeView.getDouble(s2t('left')), activeView.getDouble(s2t('bottom')), activeView.getDouble(s2t('right'))])
        };

        var r = new ActionReference();
        r.putProperty(s2t('property'), p = s2t('bounds'));
        r.putIdentifier(s2t('layer'), layerID);

        var lrBounds = executeActionGet(r).getObjectValue(p);
        x = lrBounds.getUnitDoubleValue(s2t('left')) + lrBounds.getUnitDoubleValue(s2t('width')) / 2,
            y = lrBounds.getUnitDoubleValue(s2t('top')) + lrBounds.getUnitDoubleValue(s2t('height')) / 2,
            w = lrBounds.getUnitDoubleValue(s2t('width')),
            h = lrBounds.getUnitDoubleValue(s2t('height')),
            k = Math.min(docW / w, docH / h) * (zoom ? zoom : 1),
            d = new ActionDescriptor();
        d.putUnitDouble(s2t('zoom'), s2t('percentUnit'), k);
        setProperty('document', 'zoom', d);

        var d = new ActionDescriptor();
        d.putUnitDouble(s2t('horizontal'), s2t('distanceUnit'), x * k);
        d.putUnitDouble(s2t('vertical'), s2t('distanceUnit'), y * k);
        setProperty('document', 'center', d);

        function setProperty(target, property, desc) {
            var r = new ActionReference();
            r.putProperty(s2t('property'), p = s2t(property));
            r.putEnumerated(s2t(target), s2t('ordinal'), s2t('targetEnum'));
            var d = new ActionDescriptor;
            d.putReference(s2t('null'), r);
            d.putObject(s2t('to'), p, desc);
            executeAction(s2t('set'), d, DialogModes.NO);
        };
    };
    function findTextLayer(content) {
        var r = new ActionReference();
        r.putProperty(s2t('property'), p = s2t('numberOfLayers'));
        r.putEnumerated(s2t('document'), s2t('ordinal'), s2t('targetEnum'));
        var len = executeActionGet(r).getInteger(p);
        for (var i = 1; i <= len; i++) {
            var r = new ActionReference();
            r.putProperty(s2t('property'), p = s2t('layerKind'));
            r.putIndex(s2t('layer'), i);
            if (executeActionGet(r).getInteger(p) == 3) {
                var r = new ActionReference();
                r.putProperty(s2t('property'), p = s2t('textKey'));
                r.putIndex(s2t('layer'), i);
                var text = executeActionGet(r).getObjectValue(p).getString(p);
                if (text.indexOf(content) != -1) {
                    var r = new ActionReference();
                    r.putProperty(s2t('property'), p = s2t('layerID'));
                    r.putIndex(s2t('layer'), i);
                    return executeActionGet(r).getInteger(p);
                };
            };
        };
        return null;
    };

};
