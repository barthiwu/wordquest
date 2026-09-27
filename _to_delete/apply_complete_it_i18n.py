import json

COMPLETE_IT = {
    'en': {'genericError': 'Could not reach Complete It right now.'},
    'fr': {'genericError': "Impossible d'accéder à Complete It pour le moment."},
    'es': {'genericError': 'No se pudo conectar con Complete It en este momento.'},
    'de': {'genericError': 'Complete It konnte momentan nicht erreicht werden.'},
    'ar': {'genericError': 'تعذّر الوصول إلى Complete It حاليًا.'},
    'pt': {'genericError': 'Não foi possível acessar o Complete It agora.'},
    'zh': {'genericError': '暂时无法连接到 Complete It。'},
    'hi': {'genericError': 'अभी Complete It से संपर्क नहीं हो सका।'},
    'ru': {'genericError': 'Не удалось подключиться к Complete It.'},
    'sw': {'genericError': 'Imeshindwa kufikia Complete It kwa sasa.'},
    'fa': {'genericError': 'اکنون امکان دسترسی به Complete It نیست.'},
}

# Shared across ScrambleQuest and Complete It's "back to Play" button,
# now that both are launched from the Play tab rather than a standalone
# Arcade hub (ArcadeScreen retired). Lives in the shared `arcade`
# namespace alongside the other cross-game strings (play/comingSoon/
# game titles) rather than being duplicated per game.
ARCADE_BACK_TO_PLAY = {
    'en': 'Back to Play',
    'fr': 'Retour à Jouer',
    'es': 'Volver a Jugar',
    'de': 'Zurück zu Spielen',
    'ar': 'الرجوع إلى لعب',
    'pt': 'Voltar para Jogar',
    'zh': '返回玩',
    'hi': 'खेलें पर वापस जाएं',
    'ru': 'Назад к разделу «Играть»',
    'sw': 'Rudi kwa Cheza',
    'fa': 'بازگشت به بازی',
}

LANGS = ['en', 'fr', 'es', 'de', 'ar', 'pt', 'zh', 'hi', 'ru', 'sw', 'fa']
EXPECTED_KEYS = {'genericError'}

for lang in LANGS:
    path = f'mobile/src/i18n/locales/{lang}.json'
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    assert set(COMPLETE_IT[lang].keys()) == EXPECTED_KEYS, f'{lang} completeIt key mismatch'
    data['completeIt'] = COMPLETE_IT[lang]
    data['arcade']['backToPlay'] = ARCADE_BACK_TO_PLAY[lang]

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')

# Verification
ok = True
for lang in LANGS:
    path = f'mobile/src/i18n/locales/{lang}.json'
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    if set(data['completeIt'].keys()) != EXPECTED_KEYS:
        print(f'{lang}: completeIt key mismatch {set(data["completeIt"].keys())}')
        ok = False
    if 'backToPlay' not in data['arcade']:
        print(f'{lang}: arcade.backToPlay missing')
        ok = False

print('ALL_OK' if ok else 'FAILURES_ABOVE')
