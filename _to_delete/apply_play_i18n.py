import json

PLAY = {
    'en': {
        'title': 'Play',
        'loadError': 'Could not load your quests right now.',
        'startQuest': 'Start Quest',
        'completedBadge': 'Completed',
        'allDoneToday': 'All done for today — nice work!',
        'otherQuestsLabel': 'Other quests',
        'dropdownToggleAccessibilityLabel': 'Show other quests',
        'selectQuestAccessibilityLabel': 'Select {{title}}',
        'completedAccessibilityLabel': '{{title}}, completed',
        'bossBattleSubtitle': 'Weekly timed challenge against everyone',
    },
    'fr': {
        'title': 'Jouer',
        'loadError': 'Impossible de charger tes quêtes pour le moment.',
        'startQuest': 'Commencer la quête',
        'completedBadge': 'Terminée',
        'allDoneToday': "Tout est terminé pour aujourd'hui — bravo !",
        'otherQuestsLabel': 'Autres quêtes',
        'dropdownToggleAccessibilityLabel': 'Afficher les autres quêtes',
        'selectQuestAccessibilityLabel': 'Sélectionner {{title}}',
        'completedAccessibilityLabel': '{{title}}, terminée',
        'bossBattleSubtitle': 'Défi hebdomadaire chronométré contre tout le monde',
    },
    'es': {
        'title': 'Jugar',
        'loadError': 'No se pudieron cargar tus misiones en este momento.',
        'startQuest': 'Comenzar misión',
        'completedBadge': 'Completada',
        'allDoneToday': 'Todo listo por hoy — ¡buen trabajo!',
        'otherQuestsLabel': 'Otras misiones',
        'dropdownToggleAccessibilityLabel': 'Mostrar otras misiones',
        'selectQuestAccessibilityLabel': 'Seleccionar {{title}}',
        'completedAccessibilityLabel': '{{title}}, completada',
        'bossBattleSubtitle': 'Desafío semanal cronometrado contra todos',
    },
    'de': {
        'title': 'Spielen',
        'loadError': 'Deine Quests konnten momentan nicht geladen werden.',
        'startQuest': 'Quest starten',
        'completedBadge': 'Abgeschlossen',
        'allDoneToday': 'Für heute alles erledigt — gut gemacht!',
        'otherQuestsLabel': 'Weitere Quests',
        'dropdownToggleAccessibilityLabel': 'Weitere Quests anzeigen',
        'selectQuestAccessibilityLabel': '{{title}} auswählen',
        'completedAccessibilityLabel': '{{title}}, abgeschlossen',
        'bossBattleSubtitle': 'Wöchentliche Zeit-Challenge gegen alle',
    },
    'ar': {
        'title': 'لعب',
        'loadError': 'تعذّر تحميل مهامك حاليًا.',
        'startQuest': 'ابدأ المهمة',
        'completedBadge': 'مكتملة',
        'allDoneToday': 'أنجزت كل شيء لهذا اليوم — عمل رائع!',
        'otherQuestsLabel': 'مهام أخرى',
        'dropdownToggleAccessibilityLabel': 'إظهار المهام الأخرى',
        'selectQuestAccessibilityLabel': 'اختيار {{title}}',
        'completedAccessibilityLabel': '{{title}}، مكتملة',
        'bossBattleSubtitle': 'تحدٍّ أسبوعي محدد بوقت ضد الجميع',
    },
    'pt': {
        'title': 'Jogar',
        'loadError': 'Não foi possível carregar suas missões agora.',
        'startQuest': 'Começar missão',
        'completedBadge': 'Concluída',
        'allDoneToday': 'Tudo concluído por hoje — ótimo trabalho!',
        'otherQuestsLabel': 'Outras missões',
        'dropdownToggleAccessibilityLabel': 'Mostrar outras missões',
        'selectQuestAccessibilityLabel': 'Selecionar {{title}}',
        'completedAccessibilityLabel': '{{title}}, concluída',
        'bossBattleSubtitle': 'Desafio semanal cronometrado contra todos',
    },
    'zh': {
        'title': '玩',
        'loadError': '暂时无法加载你的任务。',
        'startQuest': '开始任务',
        'completedBadge': '已完成',
        'allDoneToday': '今天的任务都完成了——干得好！',
        'otherQuestsLabel': '其他任务',
        'dropdownToggleAccessibilityLabel': '显示其他任务',
        'selectQuestAccessibilityLabel': '选择{{title}}',
        'completedAccessibilityLabel': '{{title}}，已完成',
        'bossBattleSubtitle': '每周限时挑战，所有人同场竞技',
    },
    'hi': {
        'title': 'खेलें',
        'loadError': 'अभी आपके क्वेस्ट लोड नहीं हो सके।',
        'startQuest': 'क्वेस्ट शुरू करें',
        'completedBadge': 'पूर्ण',
        'allDoneToday': 'आज के लिए सब पूरा हो गया — बहुत बढ़िया!',
        'otherQuestsLabel': 'अन्य क्वेस्ट',
        'dropdownToggleAccessibilityLabel': 'अन्य क्वेस्ट दिखाएं',
        'selectQuestAccessibilityLabel': '{{title}} चुनें',
        'completedAccessibilityLabel': '{{title}}, पूर्ण',
        'bossBattleSubtitle': 'सभी के खिलाफ साप्ताहिक समय-सीमा चुनौती',
    },
    'ru': {
        'title': 'Играть',
        'loadError': 'Не удалось загрузить ваши квесты.',
        'startQuest': 'Начать квест',
        'completedBadge': 'Завершён',
        'allDoneToday': 'На сегодня всё сделано — отличная работа!',
        'otherQuestsLabel': 'Другие квесты',
        'dropdownToggleAccessibilityLabel': 'Показать другие квесты',
        'selectQuestAccessibilityLabel': 'Выбрать {{title}}',
        'completedAccessibilityLabel': '{{title}}, завершён',
        'bossBattleSubtitle': 'Еженедельное соревнование на время против всех',
    },
    'sw': {
        'title': 'Cheza',
        'loadError': 'Imeshindwa kupakia majukumu yako kwa sasa.',
        'startQuest': 'Anza Jukumu',
        'completedBadge': 'Imekamilika',
        'allDoneToday': 'Kila kitu kimekamilika kwa leo — kazi nzuri!',
        'otherQuestsLabel': 'Majukumu mengine',
        'dropdownToggleAccessibilityLabel': 'Onyesha majukumu mengine',
        'selectQuestAccessibilityLabel': 'Chagua {{title}}',
        'completedAccessibilityLabel': '{{title}}, imekamilika',
        'bossBattleSubtitle': 'Changamoto ya kila wiki yenye muda dhidi ya kila mtu',
    },
    'fa': {
        'title': 'بازی',
        'loadError': 'بارگذاری کوئست‌های شما اکنون ممکن نشد.',
        'startQuest': 'شروع کوئست',
        'completedBadge': 'تکمیل‌شده',
        'allDoneToday': 'همه‌چیز برای امروز تمام شد — عالی بود!',
        'otherQuestsLabel': 'کوئست‌های دیگر',
        'dropdownToggleAccessibilityLabel': 'نمایش کوئست‌های دیگر',
        'selectQuestAccessibilityLabel': 'انتخاب {{title}}',
        'completedAccessibilityLabel': '{{title}}، تکمیل‌شده',
        'bossBattleSubtitle': 'چالش زمان‌دار هفتگی در برابر همه',
    },
}

TABS_PLAY = {
    'en': 'Play', 'fr': 'Jouer', 'es': 'Jugar', 'de': 'Spielen', 'ar': 'لعب',
    'pt': 'Jogar', 'zh': '玩', 'hi': 'खेलें', 'ru': 'Играть', 'sw': 'Cheza', 'fa': 'بازی',
}

LANGS = ['en', 'fr', 'es', 'de', 'ar', 'pt', 'zh', 'hi', 'ru', 'sw', 'fa']

EXPECTED_KEYS = set(PLAY['en'].keys())

for lang in LANGS:
    path = f'mobile/src/i18n/locales/{lang}.json'
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    assert set(PLAY[lang].keys()) == EXPECTED_KEYS, f'{lang} play key mismatch'
    data['play'] = PLAY[lang]

    # rename common.tabs.quest -> common.tabs.play
    tabs = data['common']['tabs']
    assert 'quest' in tabs, f'{lang} missing common.tabs.quest'
    del tabs['quest']
    tabs['play'] = TABS_PLAY[lang]

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')

# Verification: key parity + placeholder parity across all languages for 'play' namespace.
ref = PLAY['en']
ref_placeholders = {
    k: sorted(set(__import__('re').findall(r'\{\{(\w+)\}\}', v))) for k, v in ref.items()
}
ok = True
for lang in LANGS:
    path = f'mobile/src/i18n/locales/{lang}.json'
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    play = data['play']
    if set(play.keys()) != EXPECTED_KEYS:
        print(f'KEY MISMATCH {lang}: {set(play.keys()) ^ EXPECTED_KEYS}')
        ok = False
    for k, v in play.items():
        ph = sorted(set(__import__('re').findall(r'\{\{(\w+)\}\}', v)))
        if ph != ref_placeholders.get(k, []):
            print(f'PLACEHOLDER MISMATCH {lang}.{k}: {ph} vs {ref_placeholders.get(k)}')
            ok = False
    if 'quest' in data['common']['tabs']:
        print(f'{lang}: common.tabs.quest still present')
        ok = False
    if 'play' not in data['common']['tabs']:
        print(f'{lang}: common.tabs.play missing')
        ok = False

print('ALL_OK' if ok else 'FAILURES_ABOVE')
