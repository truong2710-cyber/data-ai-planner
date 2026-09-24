/* Data AI program planner.
 *
 * Offline companion of https://dataai.telecom-paris.fr/program
 * Data comes from data.js, generated from the master website (courses,
 * regulations, and the per-course calendars of /static/schedule/<id>).
 *
 * Everything happens in the browser: the selection is kept in localStorage
 * and nothing is ever sent to a server.
 */

var LEVEL = 'M2';
var SEL = {};            // code -> 'm2' (followed this year) | 'm1' (validated in M1)
var EXT_DATAAI = {};     // code -> bool, for courses not on the master website
var MANUAL = [];         // {code, name, ects, dataai, validated} — courses not in the list

var LS_KEY = 'dataai-planner';

function isExternal(c) { return c.kind === 'external'; }

function countsAsDataAI(c) {
    if (c.kind === 'project' || c.kind === 'internship') return false;
    if (isExternal(c)) return EXT_DATAAI[c.code] !== false;
    return true;
}

function byCode(code) {
    for (var i = 0; i < DATA_AI.courses.length; i++) {
        if (DATA_AI.courses[i].code === code) return DATA_AI.courses[i];
    }
    return null;
}

function selected() {          // courses followed during the current year
    var out = [];
    for (var code in SEL) if (SEL[code] === 'm2') { var c = byCode(code); if (c) out.push(c); }
    return out;
}

function validated() {         // courses validated during a previous year (M1)
    var out = [];
    for (var code in SEL) if (SEL[code] === 'm1') { var c = byCode(code); if (c) out.push(c); }
    return out;
}

function held(code) { return SEL[code] === 'm2' || SEL[code] === 'm1'; }

function manualValidated() { return MANUAL.filter(function (m) { return m.validated; }); }
function manualCurrent()   { return MANUAL.filter(function (m) { return !m.validated; }); }

function sum(list, f) {
    var t = 0;
    for (var i = 0; i < list.length; i++) t += (f ? f(list[i]) : list[i].ects) || 0;
    return t;
}

function r2(x) { return Math.round(x * 100) / 100; }

function ectsStr(c) { return c.ects === null || c.ects === undefined ? '' : c.ects.toFixed(1) + ' ECTS'; }

// ---------------------------------------------------------------- persistence

function save() {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({
            level: LEVEL, sel: SEL, ext: EXT_DATAAI, manual: MANUAL
        }));
    } catch (e) { /* private mode, ignore */ }
}

function load() {
    try {
        var raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        var o = JSON.parse(raw);
        if (o.level) LEVEL = o.level;
        if (o.sel) SEL = o.sel;
        if (o.ext) EXT_DATAAI = o.ext;
        if (o.manual) MANUAL = o.manual;
    } catch (e) { /* ignore */ }
}

// ------------------------------------------------------------------- counting

function counts() {
    var sel = selected();
    var total = sum(sel);
    var dataai = 0, project = 0, optional = 0, internship = 0;
    for (var i = 0; i < sel.length; i++) {
        var c = sel[i], e = c.ects || 0;
        if (c.kind === 'project') project += e;
        else if (c.kind === 'internship') internship += e;
        else if (countsAsDataAI(c)) dataai += e;
        else optional += e;
    }
    // manual courses that count for this year
    manualCurrent().forEach(function (m) {
        total += m.ects;
        if (m.dataai) dataai += m.ects; else optional += m.ects;
    });
    var val = r2(sum(validated()) + sum(manualValidated()));
    var t = r2(total);
    return {
        total: t, dataai: r2(dataai), project: r2(project),
        optional: r2(optional), internship: r2(internship),
        nondataai: r2(project + optional),
        validated: val,
        grand: r2(t + val),
        courses: sel
    };
}

// ----------------------------------------------------------------- validation

function validate() {
    var R = DATA_AI.rules[LEVEL];
    var k = counts();
    var checks = [];

    function add(label, ok, detail, warn) {
        checks.push({ label: label, ok: ok, warn: !!warn, detail: detail || '' });
    }

    if (LEVEL === 'M2') {
        add('At least ' + R.min_dataai + ' ECTS in Data AI courses',
            k.dataai >= R.min_dataai,
            k.dataai + ' / ' + R.min_dataai + ' ECTS' +
            (k.dataai < R.min_dataai ? ', ' + r2(R.min_dataai - k.dataai) + ' missing' : ''));

        add('At most ' + R.max_project_or_optional + ' ECTS in a research project or non-Data AI courses',
            k.nondataai <= R.max_project_or_optional,
            k.nondataai + ' / ' + R.max_project_or_optional + ' ECTS' +
            (k.project ? ' (research project: ' + k.project + ')' : '') +
            (k.optional ? ' (non-Data AI: ' + k.optional + ')' : ''));

        add('M2 internship for ' + R.internship_ects + ' ECTS',
            k.internship >= R.internship_ects,
            k.internship + ' / ' + R.internship_ects + ' ECTS');

        var mg = R.mandatory_groups;
        for (var g in mg) {
            if (g === 'M2 Internship') continue;
            var have = null;
            for (var i = 0; i < mg[g].length; i++) {
                var c = byCode(mg[g][i]);
                if (c && held(c.code)) { have = c; break; }
            }
            add('Group ' + g, !!have,
                have ? have.code : 'no course selected yet (' + mg[g].join(', ') + ')');
        }

        add('At least ' + R.min_total + ' ECTS in total (courses, projects, internship)',
            k.total >= R.min_total, k.total + ' / ' + R.min_total + ' ECTS');
    } else {
        add('At least ' + R.min_total + ' ECTS in total',
            k.total >= R.min_total, k.total + ' / ' + R.min_total + ' ECTS');

        var nproj = k.courses.filter(function (c) { return c.kind === 'project'; }).length;
        add('At most ' + R.max_projects + ' research projects (5 ECTS each)',
            nproj <= R.max_projects, nproj + ' / ' + R.max_projects + ' projects, ' + k.project + ' ECTS');

        var nintern = k.courses.filter(function (c) { return c.kind === 'internship'; }).length;
        add('At most ' + R.max_internships + ' internship (at least 3 months, 15 ECTS)',
            nintern <= R.max_internships, nintern + ' / ' + R.max_internships + ', ' + k.internship + ' ECTS');

        add('Up to ' + R.max_optional + ' ECTS in non-Data AI courses',
            k.optional <= R.max_optional, k.optional + ' / ' + R.max_optional + ' ECTS');

        var mg2 = R.mandatory_groups;
        for (var g2 in mg2) {
            if (g2 === 'M2 Internship') continue;
            var have2 = null;
            for (var j = 0; j < mg2[g2].length; j++) {
                var c2 = byCode(mg2[g2][j]);
                if (c2 && held(c2.code)) { have2 = c2; break; }
            }
            add('Group ' + g2, !!have2,
                have2 ? have2.code : 'no course selected yet',
                !have2);
        }
    }

    return checks;
}

// ------------------------------------------------------------------ overlaps

function overlaps() {
    var sel = selected().filter(function (c) { return c.events && c.events.length; });
    var out = [];
    for (var i = 0; i < sel.length; i++) {
        for (var j = i + 1; j < sel.length; j++) {
            var a = sel[i], b = sel[j];
            var hits = [];
            for (var x = 0; x < a.events.length; x++) {
                for (var y = 0; y < b.events.length; y++) {
                    var ea = a.events[x], eb = b.events[y];
                    if (ea.s < eb.e && eb.s < ea.e) hits.push([ea, eb]);
                }
            }
            if (hits.length) out.push({ a: a, b: b, hits: hits });
        }
    }
    return out;
}

function clashCodes() {
    var s = {};
    overlaps().forEach(function (o) { s[o.a.code] = 1; s[o.b.code] = 1; });
    return s;
}

// ------------------------------------------------------------- scroll helpers

function scrollToId(id) {
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToCourse(code) {
    var tr = document.querySelector('tr[data-code="' + code + '"]');
    if (!tr) return;
    tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    tr.classList.remove('flash');
    void tr.offsetWidth;
    tr.classList.add('flash');
    setTimeout(function () { tr.classList.remove('flash'); }, 2200);
}

// -------------------------------------------------------------------- render

function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
         + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function renderCounters() {
    var R = DATA_AI.rules[LEVEL];
    var k = counts();

    function set(id, val, ruleId, ok, ruleText) {
        document.getElementById(id).textContent = val;
        var li = document.getElementById(id).parentNode;
        li.className = ok === null ? '' : (ok ? 'ok' : 'bad');
        document.getElementById(ruleId).textContent = ruleText || '';
    }

    set('n-total', k.total, 'r-total', k.total >= R.min_total, '(at least ' + R.min_total + ')');

    if (LEVEL === 'M2') {
        set('n-dataai', k.dataai, 'r-dataai', k.dataai >= R.min_dataai, '(at least ' + R.min_dataai + ')');
        set('n-project', k.project, 'r-project', k.nondataai <= R.max_project_or_optional,
            '(project + non-Data AI: at most ' + R.max_project_or_optional + ')');
        set('n-optional', k.optional, 'r-optional', k.nondataai <= R.max_project_or_optional, '');
    } else {
        set('n-dataai', k.dataai, 'r-dataai', null, '');
        set('n-project', k.project, 'r-project',
            k.courses.filter(function (c) { return c.kind === 'project'; }).length <= R.max_projects,
            '(at most ' + R.max_projects + ' projects)');
        set('n-optional', k.optional, 'r-optional', k.optional <= R.max_optional,
            '(at most ' + R.max_optional + ')');
    }

    var v = k.validated;
    document.getElementById('n-validated').textContent = v;
    document.getElementById('validated-line').style.display = v ? '' : 'none';
    document.getElementById('n-grand').textContent = k.grand;
}

function renderValidation() {
    var checks = validate();
    var h = '<table class="check">';
    for (var i = 0; i < checks.length; i++) {
        var c = checks[i];
        var cls = c.ok ? 'ok' : (c.warn ? 'warn' : 'bad');
        var mark = c.ok ? 'ok' : (c.warn ? 'to validate during the M2' : 'not met');
        h += '<tr><td class="status ' + cls + '">' + mark + '</td>'
          +  '<td>' + c.label + '<div class="detail">' + c.detail + '</div></td></tr>';
    }
    h += '</table>';
    h += '<p class="detail">' + DATA_AI.rules[LEVEL].note + '</p>';
    document.getElementById('validation').innerHTML = h;
}

function renderConflicts() {
    var ov = overlaps();
    var el = document.getElementById('conflicts');
    if (!ov.length) {
        el.innerHTML = '<p class="notice">No overlap between the courses you selected.</p>';
        return;
    }
    var h = '<p class="alert">' + ov.length + ' pair' + (ov.length > 1 ? 's' : '') +
            ' of courses share the same slot</p><table class="check">';
    for (var i = 0; i < ov.length; i++) {
        var o = ov[i];
        var n = o.hits.length;
        var first = o.hits[0];
        var t1s = fmtDate(first[0].s), t1e = fmtDate(first[0].e).split(' ').slice(-1)[0];
        var t2s = fmtDate(first[1].s).split(' ').slice(-1)[0], t2e = fmtDate(first[1].e).split(' ').slice(-1)[0];
        h += '<tr><td class="status bad">' + n + ' slot' + (n > 1 ? 's' : '') + '</td><td>'
          +  '<b><a class="codelink" data-codelink="' + o.a.code + '">' + o.a.code + '</a></b> &harr; '
          +  '<b><a class="codelink" data-codelink="' + o.b.code + '">' + o.b.code + '</a></b>'
          +  '<div class="detail">e.g. ' + t1s + ' &ndash; ' + t1e + ' vs ' + t2s + '&ndash;' + t2e
          +  (o.a.code === 'MOB_0AT09_TP' || o.b.code === 'MOB_0AT09_TP'
              ? ' (Athens week dates are estimated)' : '')
          +  '</div></td></tr>';
    }
    h += '</table>';
    el.innerHTML = h;
}

function tagFor(c) {
    if (c.kind === 'project') return '<span class="tag project">research project</span>';
    if (c.kind === 'internship') return '<span class="tag internship">internship</span>';
    if (c.mandatory_group) return '<span class="tag mandatory">' + c.mandatory_group + '</span>';
    if (isExternal(c)) return '<span class="tag">not on the website yet</span>';
    return '';
}

function courseRow(c, clash) {
    var st = SEL[c.code] || '';
    var sel = st === 'm2';
    var cl = sel && clash[c.code];
    var isProjInt = c.kind === 'project' || c.kind === 'internship';
    var slot = '';
    if (isProjInt) {
        slot = '<span class="nocal">individual</span>';
    } else if (c.has_cal) {
        slot = c.slot || '';
    } else {
        slot = '<span class="nocal">no calendar</span>';
    }
    return '<tr data-code="' + c.code + '"' + (sel ? ' class="selected"' : (st === 'm1' ? ' class="held"' : '')) + '>'
      +  '<td class="pick"><input type="checkbox" class="pick" data-code="' + c.code + '"'
      +    (sel ? ' checked' : '') + ' /></td>'
      +  '<td class="pick"><input type="checkbox" class="held" data-code="' + c.code + '"'
      +    (st === 'm1' ? ' checked' : '') + ' /></td>'
      +  '<td class="code">' + c.code
      +    (cl ? ' <a class="codelink tag project" data-scroll="overlapping">overlap</a>' : '') + '</td>'
      +  '<td class="name">' + c.name + ' ' + tagFor(c)
      +    (c.teacher ? '<div class="who">' + c.teacher + '</div>' : '')
      +    (isExternal(c)
          ? '<div class="who"><label><input type="checkbox" class="extdataai" data-code="'
            + c.code + '"' + (countsAsDataAI(c) ? ' checked' : '')
            + '/> counts as a Data AI course</label></div>' : '')
      +    (c.desc ? '<div class="desc">' + c.desc + '</div>' : '')
      +    (c.note ? '<div class="desc" style="display:block;color:#F4A261">' + c.note + '</div>' : '')
      +  '</td>'
      +  '<td class="ects">' + ectsStr(c) + '</td>'
      +  '<td class="slot">' + slot + '</td>'
      +  '<td>' + (c.desc ? '<a class="more">details</a>' : '') + '</td>'
      +  '</tr>';
}

function renderCourses() {
    var clash = clashCodes();
    var h = '';

    // ---- Courses (all groups) ----
    var groups = {}, order = [];
    DATA_AI.courses.forEach(function (c) {
        if (c.kind === 'project' || c.kind === 'internship') return;
        var g = c.group || 'Other';
        if (!groups[g]) { groups[g] = []; order.push(g); }
        groups[g].push(c);
    });
    h += '<h2>Courses</h2>';
    order.forEach(function (g) {
        var list = groups[g];
        var isMandatory = list.some(function (c) { return c.mandatory_group; });
        h += '<div class="group"><h4>' + g + '</h4>';
        if (isMandatory) {
            h += '<div class="hint">At least one course of this group must be validated '
              +  'before the end of the M2 year.</div>';
        }
        h += '<table class="courses"><thead><tr>'
          +  '<th title="followed this year">this year</th>'
          +  '<th title="validated during a previous year">already validated</th>'
          +  '<th></th><th style="text-align:left">course</th>'
          +  '<th></th><th>weekly slot</th><th></th></tr></thead>';
        list.forEach(function (c) { h += courseRow(c, clash); });
        h += '</table></div>';
    });

    // ---- Research projects ----
    var projects = DATA_AI.courses.filter(function (c) { return c.kind === 'project'; });
    h += '<h2>Research projects</h2>';
    h += '<p class="detail">Research projects are a way to have a first contact with research: '
      +  'roughly 10 days of work (around 70h), scattered throughout a semester. They should '
      +  'not overlap with each other or with an internship.</p>';
    h += '<table class="courses"><thead><tr>'
      +  '<th>this year</th><th>already validated</th><th></th>'
      +  '<th style="text-align:left">project</th><th></th><th></th><th></th></tr></thead>';
    projects.forEach(function (c) { h += courseRow(c, {}); });
    h += '</table>';

    // ---- Internships ----
    var internships = DATA_AI.courses.filter(function (c) { return c.kind === 'internship'; });
    h += '<h2>Internships</h2>';
    h += '<p class="detail">The M2 internship is mandatory (30 ECTS). The M1 internship can be '
      +  'ticked as already validated by M2 students who did it.</p>';
    h += '<table class="courses"><thead><tr>'
      +  '<th>this year</th><th>already validated</th><th></th>'
      +  '<th style="text-align:left">internship</th><th></th><th></th><th></th></tr></thead>';
    internships.forEach(function (c) { h += courseRow(c, {}); });
    h += '</table>';

    // ---- Courses not in the list (manual ECTS) ----
    h += '<h2>Courses not in the list</h2>';
    h += '<p class="detail">Some courses from previous years are not taught anymore. '
      +  'If you need to mention their ECTS, <a id="manual-toggle">add them manually</a>.</p>';
    h += '<div id="manual-form" style="display:none">'
      +  '<table class="formtable"><tr><th>Code:</th><td><input type="text" id="man-code" '
      +  'placeholder="e.g. CSC_XXXXX_EP" /></td></tr>'
      +  '<tr><th>Name:</th><td><input type="text" id="man-name" placeholder="optional" /></td></tr>'
      +  '<tr><th>ECTS:</th><td><input type="number" id="man-ects" step="0.5" min="0" value="2.5" /></td></tr>'
      +  '<tr><th></th><td><label><input type="checkbox" id="man-dataai" checked /> counts as a Data AI course</label>'
      +  ' &nbsp; <label><input type="checkbox" id="man-validated" checked /> validated in a previous year</label></td></tr>'
      +  '<tr><th></th><td><button class="blue_button" id="man-add">Add course</button></td></tr></table></div>'
      +  '<div id="manual-list"></div>';

    document.getElementById('courselist').innerHTML = h;
    renderManualList();
}

function renderManualList() {
    var el = document.getElementById('manual-list');
    if (!MANUAL.length) { el.innerHTML = ''; return; }
    var h = '<table class="courses"><thead><tr><th></th>'
      +  '<th style="text-align:left">course</th><th></th><th></th><th></th></tr></thead>';
    MANUAL.forEach(function (m, i) {
        h += '<tr data-manual="' + i + '">'
          +  '<td class="code">' + m.code + '</td>'
          +  '<td class="name">' + (m.name || '') + ' '
          +    (m.dataai ? '<span class="tag mandatory">Data AI</span>' : '<span class="tag">non-Data AI</span>')
          +    (m.validated ? '<span class="tag internship">previous year</span>' : '')
          +  '</td>'
          +  '<td class="ects">' + m.ects.toFixed(1) + ' ECTS</td>'
          +  '<td><a class="more man-del" data-manual="' + i + '">remove</a></td></tr>';
    });
    h += '</table>';
    el.innerHTML = h;
}

// ------------------------------------------------------------------- calendar

var CAL = null;

function calEvents() {
    var clash = clashCodes();
    var evs = [];
    DATA_AI.courses.forEach(function (c) {
        if (SEL[c.code] !== 'm2') return;           // only courses followed this year
        if (!c.events || !c.events.length) return;
        for (var i = 0; i < c.events.length; i++) {
            var e = c.events[i];
            evs.push({
                title: c.code,
                titlefeed: c.code,
                start: e.s,
                end: e.e,
                loc: e.loc,
                description: e.sum,
                color: c.color,
                textColor: '#FFF',
                className: [clash[c.code] ? 'clash' : 'sel'],
                selected: true
            });
        }
    });
    return evs;
}

function initCalendar() {
    $('#calendar').fullCalendar({
        header: {
            left: 'prev,next today',
            center: 'title',
            right: 'month,agendaWeek,agendaDay,listWeek,listMonth'
        },
        defaultView: 'agendaWeek',
        defaultDate: '2026-09-14',
        firstDay: 1,
        locale: 'en',
        lang: 'en',
        minTime: '08:00:00',
        maxTime: '18:00:00',
        weekends: false,
        views: {
            listWeek: { buttonText: 'list week' },
            listMonth: { buttonText: 'list month' }
        },
        navLinks: true,
        editable: false,
        eventLimit: true,
        events: calEvents(),
        eventRender: function (event, element, view) {
            if (!event.title.includes(event.titlefeed)) {
                element.find('.fc-title').replaceWith(event.titlefeed);
            }
            var tip = '<small>' + (event.start.format('HH:mm') + ' - ' + event.end.format('HH:mm'))
                    + '</small><br/><b>' + event.titlefeed + '</b>'
                    + ((event.description) ? ('<br/>' + event.description) : ' ')
                    + ((event.loc) ? ('<br/><b>Venue: </b>' + event.loc) : ' ');
            if (view.name === 'listMonth' || view.name === 'listWeek') {
                element.find('.fc-list-item-title').append(
                    '<div style="margin-top:5px;"></div><span style="font-size:0.9em">'
                    + (event.titlefeed || 'no description') + '</span>'
                    + ((event.loc) ? ('<span style="margin-top:5px;display:block"><b>Venue: </b>'
                        + event.loc + '</span>') : ' '));
            } else {
                element.qtip({
                    content: { text: tip },
                    style: { classes: 'qtip-bootstrap qtip-rounded qtip-shadown qtip-light' },
                    position: (view.name === 'agendaWeek' || view.name === 'agendaDay')
                        ? { my: 'center left', at: 'center right' }
                        : { my: 'top left', at: 'bottom center' }
                });
            }
        }
    });
    CAL = $('#calendar');
}

function refreshCalendar() {
    if (!CAL) return;
    CAL.fullCalendar('removeEvents');
    CAL.fullCalendar('addEventSource', calEvents());
}

function renderLegend() {
    var h = '';
    DATA_AI.courses.forEach(function (c) {
        if (SEL[c.code] !== 'm2' || !c.has_cal) return;
        h += "<div class='calendar-feed'>"
          +  "<span class='fc-event-dot' style='background-color:" + c.color + "'></span>"
          +  "<span> <a class='codelink' data-codelink='" + c.code + "'>" + c.name + "</a></span></div>";
    });
    document.getElementById('legend-feeds').innerHTML = h;
}

function renderStats() {
    var sel = selected().filter(function (c) { return c.events && c.events.length; });
    var el = document.getElementById('stats');
    if (!sel.length) { el.innerHTML = '<p class="notice">Select some courses to see your schedule statistics.</p>'; return; }

    // gather all sessions with the course code
    var sessions = [];
    sel.forEach(function (c) {
        c.events.forEach(function (e) { sessions.push({ code: c.code, s: new Date(e.s), e: new Date(e.e) }); });
    });
    sessions.sort(function (a, b) { return a.s - b.s; });

    var first = sessions[0].s, last = sessions[sessions.length - 1].e;
    // count distinct days with at least one session
    var days = {};
    sessions.forEach(function (x) { days[x.s.toDateString()] = 1; });
    var nDays = Object.keys(days).length;

    // weekly volume: total minutes / number of weeks spanned (approx), rounded to .5h
    var spanMs = last - first;                       // ms between first and last session
    var weeks = Math.max(1, Math.round(spanMs / (7 * 24 * 3600 * 1000)));
    var totalMin = 0;
    sessions.forEach(function (x) { totalMin += (x.e - x.s) / 60000; });
    var perWeek = Math.round((totalMin / weeks) / 30) / 2;

    function when(d) { return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    function whenShort(d) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

    var h = '<table class="check">';
    h += '<tr><td class="status ok">start</td><td><b>Your courses start on ' + when(first) + '</b>'
      +  '<div class="detail">first session: ' + sessions[0].code + ' (' + whenShort(first) + ')</div></td></tr>';
    h += '<tr><td class="status ok">end</td><td><b>You are done on ' + when(last) + '</b>'
      +  '<div class="detail">last session: ' + sessions[sessions.length - 1].code + ' (' + whenShort(last) + ')</div></td></tr>';
    h += '<tr><td class="status ok">volume</td><td><b>~' + perWeek + ' hours of class per week</b>'
      +  '<div class="detail">' + nDays + ' teaching days over ~' + weeks + ' weeks (' + totalMin + ' min total)</div></td></tr>';
    h += '</table>';
    el.innerHTML = h;
}

function renderFormText() {
    var el = document.getElementById('form-text');
    if (!el) return;
    el.value = buildFormText();
}

function renderAll() {
    renderCounters();
    renderValidation();
    renderStats();
    renderConflicts();
    renderCourses();
    renderLegend();
    refreshCalendar();
    renderFormText();
    save();
}

// --------------------------------------------------------------------- export

function buildICS() {
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IP Paris//Data AI program//EN',
             'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Data AI ' + LEVEL, 'X-WR-TIMEZONE:Europe/Paris'];
    function esc(s) { return (s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }
    // ICS timestamps must be YYYYMMDDTHHMMSS; our data stores times without seconds
    function stamp(iso) {
        var s = iso.replace(/[-:]/g, '');
        if (s.length === 13) s += '00';          // YYYYMMDDTHHMM -> add seconds
        return s;
    }

    selected().forEach(function (c) {
        if (c.kind === 'project' || c.kind === 'internship') return;  // no timetable
        if (!c.events) return;
        c.events.forEach(function (e, i) {
            L.push('BEGIN:VEVENT');
            L.push('UID:' + c.code + '-' + i + '-' + stamp(e.s) + '@dataai.telecom-paris.fr');
            L.push('DTSTART;TZID=Europe/Paris:' + stamp(e.s));
            L.push('DTEND;TZID=Europe/Paris:' + stamp(e.e));
            L.push('SUMMARY:' + esc(c.code + ' - ' + c.name));
            if (e.loc) L.push('LOCATION:' + esc(e.loc));
            L.push('DESCRIPTION:' + esc((e.sum || '') + (c.teacher ? ' | ' + c.teacher : '')
                     + (c.ects ? ' | ' + c.ects.toFixed(1) + ' ECTS' : '')));
            L.push('END:VEVENT');
        });
    });
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
}

function buildText() {
    var k = counts();
    var lines = ['Data AI program, ' + DATA_AI.rules[LEVEL].label, ''];
    k.courses.sort(function (a, b) { return (a.group || '').localeCompare(b.group || '')
                                          || a.code.localeCompare(b.code); });
    var lastG = null;
    k.courses.forEach(function (c) {
        if (c.group !== lastG) { lines.push(c.group); lastG = c.group; }
        lines.push('  ' + c.code + ' - ' + c.name + ' (' + (c.ects !== null ? c.ects.toFixed(1) : '?') + ' ECTS)');
    });
    manualCurrent().forEach(function (m) {
        if (!lines.length || lines[lines.length - 1] !== 'Courses not in the list') lines.push('Courses not in the list');
        lines.push('  ' + m.code + ' - ' + (m.name || '') + ' (' + m.ects.toFixed(1) + ' ECTS)');
    });
    lines.push('');
    lines.push('Total ECTS: ' + k.total);
    lines.push('DataAI ECTS: ' + k.dataai);
    lines.push('Project ECTS: ' + k.project);
    lines.push('Optional ECTS: ' + k.optional);
    if (k.validated) lines.push('Validated in a previous year: ' + k.validated);
    return lines.join('\n');
}

// Text for the official registration form (https://dataai.telecom-paris.fr/program)
// "Courses outside of Data AI" is parsed automatically from this text.
function buildFormOutside() {
    var lines = [];
    counts().courses.forEach(function (c) {
        if (c.kind === 'project' || c.kind === 'internship') return;
        if (countsAsDataAI(c)) return;
        lines.push(c.code + ' ' + c.name + ' (' + (c.ects !== null ? c.ects.toFixed(1) : '?') + ' ECTS)');
    });
    manualCurrent().forEach(function (m) {
        if (!m.dataai) lines.push(m.code + ' ' + (m.name || '') + ' (' + m.ects.toFixed(1) + ' ECTS)');
    });
    return lines.join('\n');
}

// "Comments": justify the warnings that do not apply (courses taken last year to
// validate the mandatory groups, PhD track, etc.)
function buildComments() {
    var R = DATA_AI.rules[LEVEL];
    var k = counts();
    var parts = [];

    if (LEVEL === 'M2') {
        var held = validated();
        if (held.length) {
            var byGroup = {};
            held.forEach(function (c) {
                if (c.mandatory_group) byGroup[c.mandatory_group] = c.code;
            });
            var desc = [];
            for (var g in byGroup) desc.push(g + ' (' + byGroup[g] + ')');
            parts.push('I validated the following mandatory groups during the previous year: '
                     + desc.join(', ') + '.');
        }
        if (k.validated) {
            parts.push('I already have ' + k.validated + ' ECTS from the previous year that do not count for this year.');
        }
        if (!parts.length) {
            parts.push('I am validating all mandatory groups during this M2 year.');
        }
    } else {
        parts.push('I am in the M1 year.');
    }
    return parts.join('\n');
}

function buildFormText() {
    var outside = buildFormOutside();
    var comments = buildComments();
    return 'Courses outside of Data AI:\n' + (outside || '(none)')
         + '\n\nComments:\n' + comments;
}

function download(name, text, type) {
    var b = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

function copyToClipboard(text, done) {
    function legacy() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, legacy);
    } else {
        legacy();
    }
}

// ---------------------------------------------------------------------- init

$(document).ready(function () {
    load();
    document.getElementById('id_level').value = LEVEL;
    initCalendar();
    renderAll();

    $('#id_level').on('change', function () { LEVEL = this.value; renderAll(); });

    $(document).on('change', 'input.pick', function () {
        var code = this.getAttribute('data-code');
        if (this.checked) SEL[code] = 'm2';
        else if (SEL[code] === 'm2') delete SEL[code];
        renderAll();
    });

    $(document).on('change', 'input.held', function () {
        var code = this.getAttribute('data-code');
        if (this.checked) SEL[code] = 'm1';
        else if (SEL[code] === 'm1') delete SEL[code];
        renderAll();
    });

    $(document).on('change', 'input.extdataai', function () {
        EXT_DATAAI[this.getAttribute('data-code')] = this.checked;
        renderAll();
    });

    $(document).on('click', 'a.more', function () {
        $(this).closest('tr').toggleClass('open');
        this.textContent = $(this).closest('tr').hasClass('open') ? 'hide' : 'details';
    });

    // clickable course codes / section links
    $(document).on('click', 'a.codelink', function () {
        var target = this.getAttribute('data-codelink');
        if (target) scrollToCourse(target);
        else {
            var sec = this.getAttribute('data-scroll');
            if (sec) scrollToId(sec);
        }
        return false;
    });

    // manual ECTS (delegated: the form is re-rendered on every renderAll)
    $(document).on('click', '#manual-toggle', function () {
        $('#manual-form').toggle();
        return false;
    });
    $(document).on('click', '#man-add', function () {
        var code = $('#man-code').val().trim();
        var name = $('#man-name').val().trim();
        var ects = parseFloat($('#man-ects').val());
        if (!code || !(ects > 0)) { alert('Give a course code and a positive number of ECTS.'); return; }
        MANUAL.push({
            code: code, name: name, ects: ects,
            dataai: $('#man-dataai').is(':checked'),
            validated: $('#man-validated').is(':checked')
        });
        $('#man-code').val(''); $('#man-name').val('');
        renderAll();
    });
    $(document).on('click', 'a.man-del', function () {
        MANUAL.splice(parseInt(this.getAttribute('data-manual'), 10), 1);
        renderAll();
        return false;
    });

    $('#btn-ics').on('click', function () {
        download('data-ai-' + LEVEL.toLowerCase() + '-program.ics', buildICS(), 'text/calendar');
    });

    $('#btn-text').on('click', function () {
        copyToClipboard(buildText(), function () {
            $('#btn-text').text('Copied!');
            setTimeout(function () { $('#btn-text').text('Copy as text'); }, 1500);
        });
    });

    $('#btn-form-copy').on('click', function () {
        copyToClipboard(document.getElementById('form-text').value, function () {
            $('#btn-form-copy').text('Copied!');
            setTimeout(function () { $('#btn-form-copy').text('Copy form text'); }, 1500);
        });
    });

    $('#btn-clear').on('click', function () {
        if (!confirm('Reset the selection?')) return;
        SEL = {}; EXT_DATAAI = {}; MANUAL = [];
        renderAll();
    });
});