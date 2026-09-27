/**
 * "Word tip" cards shown on Word Duel's matchmaking screen while the
 * player waits for an opponent (Barth, Sept 2026: Option C "Duel Prep
 * Journey" — approved as-is, with "about 100 tips, so it doesn't run
 * out any time fast"). English vocabulary, same as the rest of
 * WordQuest's own word content — not run through i18n, matching how
 * ScrambleQuest/Complete It's definitions/synonyms are always English
 * regardless of the UI language, since the words being taught ARE
 * English.
 *
 * Kept intentionally mid-to-upper intermediate (CEFR B1-C1-ish) rather
 * than beginner-basic, since these are meant to feel like a genuine
 * "pick this up for your next duel answer" nudge, not filler.
 */
export interface WordDuelTip {
  word: string;
  definition: string;
  usage: string;
}

export const WORD_DUEL_TIPS: WordDuelTip[] = [
  {
    word: 'Ephemeral',
    definition: 'lasting for a very short time',
    usage: 'Try slipping it into your next duel answer.',
  },
  {
    word: 'Ubiquitous',
    definition: 'present or found everywhere',
    usage: 'A word that describes almost anything common.',
  },
  {
    word: 'Meticulous',
    definition: 'showing great attention to detail',
    usage: 'Useful for describing careful, precise work.',
  },
  {
    word: 'Resilient',
    definition: 'able to recover quickly from difficulties',
    usage: 'A great word for bouncing back from a tough round.',
  },
  {
    word: 'Candid',
    definition: 'truthful and straightforward; frank',
    usage: 'Handy when someone gives their honest opinion.',
  },
  {
    word: 'Elusive',
    definition: 'difficult to find, catch, or achieve',
    usage: 'Perfect for describing a tricky word to guess.',
  },
  {
    word: 'Lucid',
    definition: 'expressed clearly; easy to understand',
    usage: 'Describes writing or speech that makes perfect sense.',
  },
  {
    word: 'Pragmatic',
    definition: 'dealing with things sensibly and realistically',
    usage: 'The opposite of idealistic — very practical.',
  },
  {
    word: 'Ambiguous',
    definition: 'open to more than one interpretation',
    usage: 'A word for anything unclear or vague.',
  },
  {
    word: 'Tenacious',
    definition: 'holding firmly to a course of action',
    usage: 'Great for describing someone who never gives up.',
  },
  {
    word: 'Frivolous',
    definition: 'not having any serious purpose or value',
    usage: 'Describes something silly or unimportant.',
  },
  {
    word: 'Innate',
    definition: 'existing from birth; natural, not learned',
    usage: 'Think "innate talent" — something you were born with.',
  },
  {
    word: 'Discern',
    definition: 'to perceive or recognize something clearly',
    usage: 'To discern is to tell one thing apart from another.',
  },
  {
    word: 'Ambivalent',
    definition: 'having mixed feelings about something',
    usage: 'When you can’t decide how you feel — good or bad.',
  },
  {
    word: 'Concise',
    definition: 'giving a lot of information clearly in few words',
    usage: 'The opposite of wordy — short and to the point.',
  },
  {
    word: 'Diligent',
    definition: 'showing care and effort in work or duties',
    usage: 'A diligent player double-checks before submitting.',
  },
  {
    word: 'Eloquent',
    definition: 'fluent and persuasive in speaking or writing',
    usage: 'Describes someone who expresses ideas beautifully.',
  },
  {
    word: 'Feasible',
    definition: 'possible to do easily or conveniently',
    usage: 'If a plan is feasible, it’s realistic to carry out.',
  },
  {
    word: 'Genuine',
    definition: 'truly what it is said to be; authentic',
    usage: 'The opposite of fake — real and sincere.',
  },
  {
    word: 'Hypothetical',
    definition: 'based on a suggested idea, not necessarily true',
    usage: 'Used for "what if" situations.',
  },
  {
    word: 'Inevitable',
    definition: 'certain to happen; unavoidable',
    usage: 'Something that simply cannot be prevented.',
  },
  {
    word: 'Jubilant',
    definition: 'feeling or showing great happiness',
    usage: 'How you might feel after winning a duel!',
  },
  {
    word: 'Keen',
    definition: 'having a strong interest or enthusiasm',
    usage: 'To be "keen on" something is to really like it.',
  },
  {
    word: 'Lenient',
    definition: 'permissive; not strict or harsh',
    usage: 'A lenient teacher goes easy on small mistakes.',
  },
  {
    word: 'Meager',
    definition: 'small in amount; lacking in quantity',
    usage: 'A meager harvest is a disappointingly small one.',
  },
  {
    word: 'Nostalgic',
    definition: 'feeling wistful affection for the past',
    usage: 'That warm feeling when you remember old times.',
  },
  {
    word: 'Obsolete',
    definition: 'no longer produced or used; out of date',
    usage: 'Think of technology that’s been replaced.',
  },
  {
    word: 'Plausible',
    definition: 'seeming reasonable or probable',
    usage: 'A plausible excuse is one that sounds believable.',
  },
  {
    word: 'Quaint',
    definition: 'attractively unusual or old-fashioned',
    usage: 'A quaint village feels charming and a bit old-fashioned.',
  },
  {
    word: 'Reluctant',
    definition: 'unwilling and hesitant to do something',
    usage: 'Someone reluctant drags their feet before agreeing.',
  },
  {
    word: 'Scrutinize',
    definition: 'to examine or inspect closely and thoroughly',
    usage: 'Scrutinize the clue before you type your answer.',
  },
  {
    word: 'Tedious',
    definition: 'too long, slow, or dull; tiresome',
    usage: 'The opposite of exciting — a real drag to sit through.',
  },
  {
    word: 'Unanimous',
    definition: 'fully in agreement; agreed by everyone',
    usage: 'A unanimous vote means no one disagreed.',
  },
  {
    word: 'Versatile',
    definition: 'able to adapt to many different functions',
    usage: 'A versatile player is comfortable in any game mode.',
  },
  {
    word: 'Wary',
    definition: 'feeling or showing caution about danger',
    usage: 'To be wary is to watch out carefully for risk.',
  },
  {
    word: 'Zealous',
    definition: 'having great energy or enthusiasm for a cause',
    usage: 'A zealous fan cheers louder than anyone else.',
  },
  {
    word: 'Astute',
    definition: 'having sharp judgment; shrewd',
    usage: 'An astute guess is a clever, well-reasoned one.',
  },
  {
    word: 'Benevolent',
    definition: 'kind and generous',
    usage: 'A benevolent act is done out of genuine goodwill.',
  },
  {
    word: 'Cordial',
    definition: 'warm and friendly',
    usage: 'A cordial greeting is warm without being overly familiar.',
  },
  {
    word: 'Deft',
    definition: 'neatly skillful and quick in movement',
    usage: 'A deft typist barely looks at the keyboard.',
  },
  {
    word: 'Emulate',
    definition: 'to match or imitate, especially to strive to equal',
    usage: 'You might emulate a player whose skills you admire.',
  },
  {
    word: 'Fastidious',
    definition: 'very attentive to detail; hard to please',
    usage: 'A fastidious speller triple-checks every word.',
  },
  {
    word: 'Gregarious',
    definition: 'fond of company; sociable',
    usage: 'A gregarious person loves being around others.',
  },
  {
    word: 'Hindrance',
    definition: 'a thing that gets in the way of progress',
    usage: 'A slow connection can be a real hindrance in a duel.',
  },
  {
    word: 'Impartial',
    definition: 'treating all sides equally; not biased',
    usage: 'An impartial judge favors no one.',
  },
  {
    word: 'Jovial',
    definition: 'cheerful and friendly',
    usage: 'A jovial mood makes any game more fun.',
  },
  {
    word: 'Kindle',
    definition: 'to start a fire, or to arouse an emotion',
    usage: 'A great win can kindle real excitement for the next round.',
  },
  {
    word: 'Latent',
    definition: 'existing but not yet visible or active',
    usage: 'A latent skill is there, just waiting to be shown.',
  },
  {
    word: 'Malleable',
    definition: 'easily shaped or influenced',
    usage: 'Think of soft clay — or an open, adaptable mind.',
  },
  {
    word: 'Nurture',
    definition: 'to care for and encourage growth or development',
    usage: 'You nurture a skill by practicing it often.',
  },
  {
    word: 'Opulent',
    definition: 'ostentatiously rich and luxurious',
    usage: 'An opulent palace is dripping with grandeur.',
  },
  {
    word: 'Placid',
    definition: 'calm and peaceful; not easily upset',
    usage: 'A placid lake has barely a ripple on its surface.',
  },
  {
    word: 'Query',
    definition: 'a question, especially one expressing doubt',
    usage: 'To query is simply to ask.',
  },
  {
    word: 'Robust',
    definition: 'strong and healthy; sturdy',
    usage: 'A robust strategy holds up even under pressure.',
  },
  {
    word: 'Solace',
    definition: 'comfort in a time of distress or sadness',
    usage: 'A kind message can offer real solace after a loss.',
  },
  {
    word: 'Thrifty',
    definition: 'careful with money; economical',
    usage: 'A thrifty shopper always looks for the best deal.',
  },
  {
    word: 'Utmost',
    definition: 'the greatest or most extreme degree',
    usage: 'Give this duel your utmost effort!',
  },
  {
    word: 'Vigilant',
    definition: 'keeping careful watch for danger or trouble',
    usage: 'Stay vigilant for tricky letter clues.',
  },
  {
    word: 'Whimsical',
    definition: 'playfully quaint or fanciful',
    usage: 'A whimsical idea is light-hearted and a little odd.',
  },
  {
    word: 'Yearn',
    definition: 'to have an intense feeling of longing',
    usage: 'To yearn for something is to really wish for it.',
  },
  {
    word: 'Zenith',
    definition: 'the time at which something is most powerful',
    usage: 'The zenith of your streak is its highest point.',
  },
  {
    word: 'Abate',
    definition: 'to become less intense or widespread',
    usage: 'A storm abates when it finally calms down.',
  },
  {
    word: 'Bolster',
    definition: 'to support or strengthen',
    usage: 'A good warm-up can bolster your confidence.',
  },
  {
    word: 'Candor',
    definition: 'the quality of being open and honest',
    usage: 'Speaking with candor means speaking plainly and truthfully.',
  },
  {
    word: 'Deplete',
    definition: 'to use up the supply or resources of',
    usage: 'A long match can deplete your focus — pace yourself.',
  },
  {
    word: 'Enigma',
    definition: 'a person or thing that is mysterious or puzzling',
    usage: 'A tricky word can feel like a total enigma.',
  },
  {
    word: 'Fortitude',
    definition: 'courage in facing pain or adversity',
    usage: 'It takes fortitude to keep guessing after a wrong answer.',
  },
  {
    word: 'Gravitate',
    definition: 'to move toward something by natural tendency',
    usage: 'Most players gravitate toward their favorite game mode.',
  },
  {
    word: 'Hasten',
    definition: 'to move or act quickly',
    usage: 'No need to hasten — take your time to think.',
  },
  {
    word: 'Immerse',
    definition: 'to involve oneself deeply in an activity',
    usage: 'Immerse yourself fully and the words start to stick.',
  },
  {
    word: 'Judicious',
    definition: 'having or showing good judgment',
    usage: 'A judicious guess weighs the clues carefully first.',
  },
  {
    word: 'Kinship',
    definition: 'a sharing of characteristics or origins',
    usage: 'Word lovers often feel a kinship with one another.',
  },
  {
    word: 'Lavish',
    definition: 'sumptuously rich, elaborate, or luxurious',
    usage: 'A lavish celebration spares no expense.',
  },
  {
    word: 'Mitigate',
    definition: 'to make less severe, serious, or painful',
    usage: 'A hint can help mitigate the difficulty of a hard word.',
  },
  {
    word: 'Notion',
    definition: 'a conception of or belief about something',
    usage: 'A notion is simply an idea or general belief.',
  },
  {
    word: 'Optimal',
    definition: 'best or most favorable under the circumstances',
    usage: 'Finding the optimal answer takes practice.',
  },
  {
    word: 'Prevalent',
    definition: 'widespread in a particular area or time',
    usage: 'A prevalent trend is one many people are following.',
  },
  {
    word: 'Quandary',
    definition: 'a state of uncertainty over what to do',
    usage: 'Stuck between two guesses? That’s a quandary.',
  },
  {
    word: 'Rebuttal',
    definition: 'a response that argues against a previous claim',
    usage: 'A strong rebuttal answers the counterargument directly.',
  },
  {
    word: 'Solitude',
    definition: 'the state of being alone, often by choice',
    usage: 'Some players focus best in quiet solitude.',
  },
  {
    word: 'Turbulent',
    definition: 'characterized by conflict or sudden change',
    usage: 'A turbulent match keeps the score flipping back and forth.',
  },
  {
    word: 'Unravel',
    definition: 'to undo or investigate something complex',
    usage: 'To unravel a scrambled word, look for patterns.',
  },
  {
    word: 'Vivid',
    definition: 'producing powerful feelings or clear images',
    usage: 'A vivid description paints a picture in your mind.',
  },
  {
    word: 'Wane',
    definition: 'to decrease in strength or intensity',
    usage: 'Energy can wane near the end of a long session.',
  },
  {
    word: 'Yield',
    definition: 'to produce or give way to pressure',
    usage: 'A good guess can yield a surprisingly high score.',
  },
  {
    word: 'Zeal',
    definition: 'great energy or enthusiasm for a cause',
    usage: 'Play with zeal and the streak will follow.',
  },
  {
    word: 'Adept',
    definition: 'very skilled or proficient at something',
    usage: 'An adept player spots patterns almost instantly.',
  },
  {
    word: 'Brevity',
    definition: 'concise and exact use of words',
    usage: 'Brevity means saying a lot with very little.',
  },
  {
    word: 'Coerce',
    definition: 'to persuade someone using force or threats',
    usage: 'The opposite of persuading gently.',
  },
  {
    word: 'Diligence',
    definition: 'careful and persistent effort or work',
    usage: 'Diligence is what turns practice into mastery.',
  },
  {
    word: 'Exuberant',
    definition: 'filled with lively energy and excitement',
    usage: 'An exuberant celebration after a big win.',
  },
  {
    word: 'Frugal',
    definition: 'sparing or economical with money or resources',
    usage: 'A frugal habit is spending carefully, not wastefully.',
  },
  {
    word: 'Gullible',
    definition: 'easily persuaded to believe something',
    usage: 'A gullible player falls for an obvious trick.',
  },
  {
    word: 'Humble',
    definition: 'having a modest view of one’s own importance',
    usage: 'Stay humble even after a winning streak.',
  },
  {
    word: 'Impetuous',
    definition: 'acting quickly without thought or care',
    usage: 'An impetuous guess is made without checking the clues.',
  },
  {
    word: 'Jarring',
    definition: 'unpleasantly incongruous or startling',
    usage: 'A jarring change is one that feels abrupt or off.',
  },
  {
    word: 'Keenness',
    definition: 'intensity of feeling or enthusiasm',
    usage: 'Your keenness to win can sharpen your focus.',
  },
  {
    word: 'Legible',
    definition: 'clear enough to read',
    usage: 'Make sure your typed answer is legible — no typos!',
  },
  {
    word: 'Modest',
    definition: 'unassuming in the estimation of one’s abilities',
    usage: 'A modest score can still be a personal best.',
  },
  {
    word: 'Novel',
    definition: 'new and not resembling something formerly known',
    usage: 'A novel strategy is one nobody’s tried before.',
  },
  {
    word: 'Ornate',
    definition: 'made in an elaborate, decorative style',
    usage: 'An ornate design has lots of fine detail.',
  },
  {
    word: 'Perceptive',
    definition: 'having keen insight or understanding',
    usage: 'A perceptive player reads the clue pattern fast.',
  },
  {
    word: 'Quell',
    definition: 'to put an end to; suppress',
    usage: 'A calm breath can quell pre-duel nerves.',
  },
  {
    word: 'Rigorous',
    definition: 'thorough, exhaustive, and extremely careful',
    usage: 'A rigorous review catches every small mistake.',
  },
  {
    word: 'Subtle',
    definition: 'delicate or precise, not obvious',
    usage: 'A subtle clue is easy to miss if you rush.',
  },
  {
    word: 'Tranquil',
    definition: 'free from disturbance; calm',
    usage: 'A tranquil mindset helps you think clearly.',
  },
  {
    word: 'Unbiased',
    definition: 'showing no prejudice for or against something',
    usage: 'An unbiased score reflects skill alone.',
  },
];
