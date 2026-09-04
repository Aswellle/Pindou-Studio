// Tutorial content data
export const TUTORIALS_EN = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: '📚',
    children: [
      {
        id: 'what-is-bead',
        title: 'What Are Fuse Beads',
        blocks: [
          { type: 'paragraph', text: 'Fuse beads (also known as Perler beads) are colorful plastic melt beads that originated in the United States and have become a craft material loved all over the world. Unlike traditional beads, fuse beads have a distinctive flat, disc-like shape with tiny bumps on both sides, which lets them fuse together and hold their shape when heated.' },
          { type: 'heading2', text: 'Main Brands' },
          { type: 'paragraph', text: 'Besides the internationally known Perler (USA), Hama (Denmark), and Artkal (China/Netherlands), Chinese-market brands such as COCO and MARD are also popular. Each brand differs slightly in color count, bead size, and texture, but the core technique is exactly the same.' },
          { type: 'bulletList', items: ['Perler: the widest color range (100+ colors) and the most well-known entry brand', 'Hama: Scandinavian style, soft and muted colors, great value for money', 'Artkal: known for metallic and fluorescent colors, with a slightly finer grain'] },
          { type: 'heading2', text: 'The Basic Principle' },
          { type: 'paragraph', text: 'The magic of fuse beads is heat-fusing: you arrange colored beads on a Pegboard according to your design, then heat them with an iron so the bead surfaces melt slightly. Once cooled, they fuse into one sturdy piece. No glue needed — the process is safe and easy to control, and the result can be flat or three-dimensional.' },
          { type: 'callout', variant: 'info', title: 'What Is a Pegboard?', text: 'A Pegboard is a plastic board with evenly spaced holes. Each bead fits neatly into one peg hole, so your rows stay straight and never slide. They come in square sizes (29×29, 57×57) and rectangle sizes (57×29), among others.' },
          { type: 'keyPoint', text: 'Fuse beads are a safe craft for all ages: no glue, simple tools, and great-looking results — the perfect entry project for building focus and creativity.' }
        ],
        content: '', steps: [], tips: ''
      },
      {
        id: 'basic-tools',
        title: 'Essential Tools',
        blocks: [
          { type: 'paragraph', text: 'Before you start creating, let\'s get to know the essential tools. Having everything ready not only makes you more efficient, it also makes crafting far more enjoyable.' },
          { type: 'heading2', text: 'Core Tools' },
          { type: 'numberedList', items: ['Fuse beads: buy a basic color set from your chosen brand — a 30-color starter set is a great place to begin', 'Pegboard: the holed plastic base board. Having 2-3 boards on hand makes sectioned work much easier', 'Iron: a regular household iron is all you need — just don\'t use the steam function', 'Ironing paper / parchment: baking paper or dedicated ironing paper that keeps the iron off the beads', 'Pattern book: ready-made designs you can trace directly — perfect for beginners'] },
          { type: 'heading2', text: 'Helpful Extras' },
          { type: 'bulletList', items: ['Tweezers: for picking up individual beads or filling tiny gaps', 'Tray: a light-colored flat tray makes it easy to sort colors and set beads aside', 'Magnetic wand: a magnetic tip that quickly picks up metal-effect beads', 'Magnifier: very handy for details and tiny characters or symbols'] },
          { type: 'callout', variant: 'tip', title: 'Advice for Beginners', text: 'Don\'t buy tons of beads at the start! Get a small 30-50 color set and one or two pegboards, enjoy the craft for a while, then slowly expand your colors and tools.' },
          { type: 'keyPoint', text: 'To get started you only need: beads + a Pegboard + an iron + ironing paper — all of it for under ¥100. Add the extras gradually as the need arises.' }
        ],
        content: '', steps: [], tips: ''
      },
      {
        id: 'first-project',
        title: 'Your First Project: Making a Heart',
        blocks: [
          { type: 'paragraph', text: 'Making a red 3D heart is the classic first project for most fuse bead crafters. Simple pattern, few colors, and a big sense of achievement — it\'s the perfect starter exercise.' },
          { type: 'heading2', text: 'Steps' },
          { type: 'numberedList', items: ['Find the reference point for the heart pattern on the Pegboard — usually starting from the center of the board', 'Place the red beads row by row from the center outward, keeping the heart\'s rounded curves smooth', 'Once all the red beads are placed, check for any missing or misaligned beads', 'Cover with ironing paper and iron at medium heat (around 150°C) for 30-40 seconds, moving in arcs from the center outward', 'Flip the piece over and iron the back for about 20-30 seconds', 'Lift it off, lay it flat on the table, and let it cool naturally for at least 15 minutes'] },
          { type: 'heading2', text: 'Things to Keep in Mind' },
          { type: 'callout', variant: 'warning', title: 'Temperature Control', text: 'Don\'t iron at too high a temperature, or the beads will warp badly or even turn yellow. Better to do several low-heat passes than one hot one. If the beads are visibly collapsing, your iron is too hot.' },
          { type: 'bulletList', items: ['Keep the iron moving the whole time — never hold it still in one spot', 'When flipping, lift and turn the piece together with the ironing paper — don\'t slide the beads', 'During cooling, press the piece gently under something heavy (like a book) to prevent warping'] },
          { type: 'keyPoint', text: 'Heart-making essentials: low heat (≤150°C), short sessions (≤40 seconds each), keep the iron moving, and cool fully. Follow these rules and your success rate will be sky-high.' }
        ],
        content: '', steps: [], tips: ''
      }
    ]
  },
  {
    id: 'ironing-guide',
    title: 'The Complete Ironing Guide',
    icon: '🔥',
    children: [
      {
        id: 'brands-guide',
        title: 'Brand Breakdown',
        blocks: [
          { type: 'paragraph', text: 'Different mainstream brands (Perler, Hama, Artkal, and similar) each have different ironing temperature requirements. Knowing each brand\'s characteristics makes ironing easier and helps you avoid mishaps.' },
          { type: 'heading2', text: 'Brand Temperature Reference' },
          { type: 'table', headers: ['Brand', 'Recommended Temperature', 'Characteristics', 'Best For'], rows: [
            ['Perler (USA)', 'around 150°C (medium heat / cotton-synthetic setting)', 'Widest color range (100+ colors), fuses well', 'The first choice for beginners'],
            ['Hama (Denmark)', 'around 150°C (medium heat)', 'Soft, muted colors with a Scandinavian style', 'Crafters who love fresh, light aesthetics'],
            ['Artkal (China/Netherlands)', '130-150°C (low to medium heat)', 'Plenty of metallic and fluorescent colors, slightly finer grain', 'Advanced and color-loving crafters'],
            ['Sillyette (Korea)', 'below 130°C (low heat)', 'Ultra-fine beads, great for intricate patterns', 'Delicate, detailed openwork pieces']
          ] },
          { type: 'callout', variant: 'info', title: 'Test the Temperature', text: 'When ironing a new brand for the first time, test on one or two beads in a corner first, check how they melt, then iron the whole piece. Prefer several low-heat passes — one too-hot pass causes irreversible warping.' },
          { type: 'heading2', text: 'Bead Size Differences' },
          { type: 'paragraph', text: 'Perler and Hama beads are about 5mm in diameter, while Artkal beads are slightly finer at about 4.7mm. That means the same pattern uses slightly different amounts of beads per brand — keep size compatibility in mind when mixing.' },
          { type: 'keyPoint', text: 'The mainstream brands covered here (Perler, Hama, Artkal, and similar) all iron within the 130-150°C range — medium-low heat across the board. Artkal prefers the low end, and Sillyette needs even lower heat.' }
        ],
        content: '', steps: [], tips: ''
      },
      {
        id: 'ironing-technique',
        title: 'Temperature and Technique',
        blocks: [
          { type: 'paragraph', text: 'Ironing is the most critical step in fuse bead crafting — it directly decides the quality of the finished piece. Mastering the right temperature and technique dramatically boosts your results.' },
          { type: 'heading2', text: 'How to Choose the Temperature' },
          { type: 'bulletList', items: ['Start from the brand\'s recommended temperature as your baseline', 'Use slightly lower heat for large patterns than for small ones (heat spreads more slowly)', 'When ironing both sides, the second side can be a little cooler than the first', 'On humid days, raise the temperature by about 5-10°C'] },
          { type: 'heading2', text: 'Standard Ironing Technique' },
          { type: 'svgDiagram', id: 'ironing-motion', caption: 'Iron in arcs, moving from the center outward' },
          { type: 'numberedList', items: ['Preheat the iron to the recommended temperature and turn off the steam function', 'Cover the beads with a sheet of ironing paper (baking paper) to keep the iron off the beads', 'Lay the iron flat on the paper and move it slowly in arcs from the center of the design outward', 'Hold each spot for about 3-5 seconds, watching for a subtle sheen on the bead surfaces', 'After about 30-50 seconds of ironing, gently flip the piece together with the paper', 'After flipping, iron the back for about 20-30 seconds'] },
          { type: 'callout', variant: 'warning', title: 'Common Mistakes', text: 'An iron that\'s too hot scorches and warps the beads; one that\'s too cool won\'t fuse them, and the piece falls apart at the lightest touch. Timing matters just as much — don\'t over-iron.' },
          { type: 'keyPoint', text: 'The three essentials of ironing: moderate heat (around 150°C), keep moving (arcs from the center outward), and cool thoroughly (≥15 minutes).' }
        ],
        content: '', steps: [], tips: ''
      },
      {
        id: 'double-sided-ironing',
        title: 'Double-Sided Ironing: The Standard Process',
        blocks: [
          { type: 'paragraph', text: 'Double-sided ironing means ironing both the front and the back of the piece so it fuses completely from the inside out — sturdier and longer-lasting. It\'s a required step for most flat fuse bead pieces.' },
          { type: 'heading2', text: 'Step-by-Step' },
          { type: 'numberedList', items: ['After placing the front-side beads, cover them gently with ironing paper', 'Set the iron to the brand\'s recommended temperature and iron in arcs from the center outward for 30-40 seconds', 'You\'re done when the bead surfaces show a subtle sheen and the edges begin to fuse', 'Gently flip the piece together with the paper (don\'t slide the beads)', 'Remove the old paper, lay down a fresh sheet, and get ready to iron the back', 'Iron the back for 20-30 seconds (slightly shorter than the front)', 'When the back is done, lift the piece off with the paper and cool it flat for at least 15 minutes'] },
          { type: 'heading2', text: 'Why Is the Back Side Shorter?' },
          { type: 'paragraph', text: 'Because the front has already done most of the fusing — the back mainly secures the edges and any loose beads. Ironing the back too long over-melts the front and blurs the design.' },
          { type: 'callout', variant: 'tip', title: 'How to Tell It\'s Right', text: 'An ideal double-sided result: a crisp design on the front, round and full beads, a slightly flatter back, and an overall level piece with no warping.' },
          { type: 'keyPoint', text: 'Core rules of double-sided ironing: the front does the main work (30-40 seconds), the back is supportive (20-30 seconds), keep ironing paper on at all times, and cool for at least 15 minutes.' }
        ],
        content: '', steps: [], tips: ''
      },
      {
        id: 'ironing-rescue',
        title: 'Troubleshooting and Rescue Guide',
        blocks: [
          { type: 'paragraph', text: 'Even with plenty of experience, things go wrong sometimes. Here are the most common mishaps and how to rescue them.' },
          { type: 'heading2', text: 'Common Problems and Solutions' },
          { type: 'table', headers: ['Problem', 'Cause', 'How to Fix It'], rows: [
            ['Severe bead warping / scorching', 'Temperature too high or ironing too long', 'Cannot be undone — take the piece apart and redo it. Next time, lower the temperature and shorten the time.'],
            ['Beads won\'t fuse and fall apart at a touch', 'Temperature too low or time too short', 'Re-cover with ironing paper and iron at low heat for 40-60 seconds, watching how the beads fuse.'],
            ['One-sided warping / curled edges', 'No weight was pressed during cooling', 'While still warm (beads still soft), flip the piece over, press it under books, and cool for 30+ minutes.'],
            ['Iron marks / stains on the surface', 'Dirty iron plate or temperature too high', 'Wipe gently with a damp cloth and a little neutral cleaner, or rub lightly with an eraser; if it won\'t come off, display that side as the back.'],
            ['Some beads fell off', 'Those beads never fully fused', 'Replace the missing beads, re-cover with ironing paper, and iron that area at low heat.']
          ] },
          { type: 'callout', variant: 'danger', title: 'When It Can\'t Be Saved', text: 'If beads have fully melted out of shape and turned black, the damage is irreversible. The only option is to remove the beads in that area, re-lay them, and iron again. Prevention beats rescue — when in doubt, go lower, never higher.' },
          { type: 'keyPoint', text: 'Most mishaps come down to temperature getting out of control. Remember the golden rule: low heat, multiple passes. Never exceed 170°C, no matter what.' }
        ],
        content: '', steps: [], tips: ''
      }
    ]
  },
  {
    id: 'anti-warp',
    title: 'Preventing Warping',
    icon: '⚖️',
    children: [
      {
        id: 'why-warping',
        title: 'Why Pieces Warp',
        blocks: [
          { type: 'paragraph', text: 'Warping is the most common quality issue in fuse bead work: after cooling, the edges curl upward or the whole piece bends into waves. Understanding what causes it is the first step to preventing it.' },
          { type: 'heading2', text: 'The Three Main Causes' },
          { type: 'numberedList', items: ['Uneven heat: if the iron lingers too long in one area, those beads melt and shrink more than the rest, creating internal stress', 'Cooling too fast: a piece that goes from hot to cool air sets on the surface while the inside is still hot and expanding, causing curling', 'No weight during cooling: with no outside force holding the melted beads, they shrink unevenly as they cool'] },
          { type: 'heading2', text: 'Which Pieces Are More Prone to Warping' },
          { type: 'bulletList', items: ['Large pieces (>57×57): heat dissipates slowly, leaving a big temperature gap between edges and center', 'Pieces dominated by dark beads: dark colors absorb more heat, making temperature distribution less even', 'Pieces ironed on one side only: with an unfused back, the structure is asymmetric and shrinks unevenly'] },
          { type: 'callout', variant: 'warning', title: 'Special Note', text: 'For anything larger than 57×57, single-sided ironing will almost certainly warp. You must combine double-sided ironing with weighted cooling.' },
          { type: 'keyPoint', text: 'Warping ultimately comes from uneven heat plus uncontrolled cooling. Prevention essentials: iron both sides thoroughly, cool under weight, and avoid rapid cooling.' }
        ],
        content: '', steps: [], tips: ''
      },
      {
        id: 'weight-pressing',
        title: 'Weighted Pressing for Flat Results',
        blocks: [
          { type: 'paragraph', text: 'Weighted pressing is the most effective anti-warping technique. Applying even pressure during the cooling phase resists the shrinkage stress of the beads and keeps the finished piece flat.' },
          { type: 'svgDiagram', id: 'pressing-stack', caption: 'Press with books and cool for at least 30 minutes' },
          { type: 'heading2', text: 'Steps' },
          { type: 'numberedList', items: ['Right after double-sided ironing, press the piece while it\'s still warm (about 50-60°C — slightly hot to the touch)', 'Place a flat board or thick cardboard larger than the piece underneath it', 'Cover with ironing paper, then put heavy objects on top (books, a cutting board, a weighted box, etc.)', 'Weight guide: 3-5 thick books for a 57×57 piece; 8-10 books or a dedicated pressing frame for a 140×140 piece', 'Keep everything still and cool for at least 30 minutes before removing the weight', 'For the best results, leave it overnight (≥8 hours) for a perfectly flat piece'] },
          { type: 'heading2', text: 'Advanced Tips' },
          { type: 'bulletList', items: ['A dedicated pressing frame gives the most even, professional results', 'For large multi-board pieces, stack layers of newspaper for even pressure', 'In winter, you can speed things up near a heater (but not under an AC vent)'] },
          { type: 'callout', variant: 'tip', title: 'The Right Moment', text: 'The best time to press is while the piece is still warm (about 50-60°C). Too hot and you\'ll damage the surface; too cold and the beads have already set, so pressing does nothing. Feel check: the ironing paper slides out easily but doesn\'t burn your hand.' },
          { type: 'keyPoint', text: 'Large pieces must be pressed: press while warm, keep pressing for 30+ minutes, and use enough weight (3-5 kg or more). That\'s the key to flat large projects.' }
        ],
        content: '', steps: [], tips: ''
      },
      {
        id: 'tape-method',
        title: 'The Tape Method for Large Pieces',
        blocks: [
          { type: 'paragraph', text: 'For extra-large pieces (100×100 and up), weight alone may not keep the piece flat. The tape method is a warp-prevention trick designed specifically for oversized patterns.' },
          { type: 'heading2', text: 'How It Works' },
          { type: 'paragraph', text: 'Before ironing, tightly wrap the edges of the Pegboard with heat-resistant masking tape so the board can\'t warp as it heats up. When the Pegboard stays flat, the beads\' shrinkage is kept in check.' },
          { type: 'heading2', text: 'Steps' },
          { type: 'numberedList', items: ['Place the pegboard on a flat, heat-resistant surface', 'Wrap masking tape (or painter\'s tape) tightly around all four edges of the pegboard, pulling it taut and pressing it down firmly', 'Make sure the four corners are secured too — nothing should feel loose', 'Lay the beads on the pegboard; the beads will hold part of the tape in place', 'Iron normally — same temperature and technique as always', 'After cooling, carefully lift the piece off with the tape still attached, then peel the tape away'] },
          { type: 'callout', variant: 'warning', title: 'Choosing the Tape', text: 'You must use heat-resistant masking tape (rated above 150°C). Ordinary clear tape melts in the heat, leaves sticky residue, and ruins the work. Baking parchment paper can be used instead.' },
          { type: 'bulletList', items: ['Made for oversized patterns above 100×100', 'Works best combined with the weighted pressing method', 'The tighter you wrap the tape, the better it holds'] },
          { type: 'keyPoint', text: 'The complete anti-warp combo for oversized pieces (>100×100): tape down all four edges of the Pegboard + double-sided ironing + weighted cooling overnight. All three are essential.' }
        ],
        content: '', steps: [], tips: ''
      }
    ]
  },
  {
    id: 'color-design',
    title: 'Color Design',
    icon: '🎨',
    children: [
      {
        id: 'color-principles',
        title: 'Color Selection Principles',
        blocks: [
          { type: 'paragraph', text: 'Color is where fuse bead design shows off personal taste and creativity. Great colors make an ordinary pattern glow, while poor choices can ruin an excellent line-art design.' },
          { type: 'heading2', text: 'Basic Principles' },
          { type: 'bulletList', items: ['Limit the number of colors: no more than 8-12 per piece — too many colors looks chaotic', 'Build a hierarchy: decide on 1-2 main colors, 2-3 supporting colors, and a few accents', 'Use the color wheel: neighboring colors (adjacent on the wheel) blend naturally, while opposites create contrast', 'Consider your stash: choose colors you already own, or prioritize basic, versatile colors when buying'] },
          { type: 'heading2', text: 'Color Advice for Beginners' },
          { type: 'paragraph', text: 'Beginners should start with simple two- or three-color patterns and gradually learn how colors work together. Once you\'re more advanced, challenge yourself with complex multi-color pieces — but always keep this in mind: less is more.' },
          { type: 'callout', variant: 'tip', title: 'Where to Find Color Inspiration', text: 'Search "Perler bead art" on Pinterest or Instagram to see great color combinations. You can also break down the palettes of your favorite cartoon or game characters and find the matching bead colors.' },
          { type: 'keyPoint', text: 'Core color rules: keep it to 12 colors or fewer, build a main-supporting hierarchy, use the color wheel wisely, and learn from great examples.' }
        ],
        content: '', steps: [], tips: ''
      },
      {
        id: 'shadow-highlight',
        title: 'Shadows and Highlights',
        blocks: [
          { type: 'paragraph', text: 'Adding shadows and highlights is the key to turning a flat paper-like pattern into a piece with real depth. Master this and your work will have much stronger visual impact.' },
          { type: 'heading2', text: 'What Are Shadows and Highlights?' },
          { type: 'paragraph', text: 'A highlight is where the light source hits hardest — the lightest color, possibly even pure white. A shadow is where light can\'t reach — the darkest color. Midtones are your regular base colors. These three levels form a complete light-and-shadow system.' },
          { type: 'heading2', text: 'How to Do It' },
          { type: 'numberedList', items: ['Lay down the base colors first — this is the skeleton of the whole piece', 'Decide the light direction (top-left is the usual default); highlights go on the light side, shadows on the opposite side', 'Add shadow colors one level darker than the base (usually 1-2 shades deeper)', 'In the brightest areas facing the light, swap in a lighter color or white for the highlight', 'Don\'t overdo the shadows — about 15-20% of the piece is plenty'] },
          { type: 'callout', variant: 'info', title: 'Keep Small Pieces Simple', text: 'If the pattern is small (<29×29), you can skip highlights or keep just 2 shades (base + shadow). Too many details at small scale just looks dirty and cluttered.' },
          { type: 'keyPoint', text: 'Light-and-shadow rules: decide the light direction first — deepen shadows on the far side, brighten highlights on the near side. Simplify small pieces; give large pieces the full three levels.' }
        ],
        content: '', steps: [], tips: ''
      },
      {
        id: 'image-to-pattern',
        title: 'Turning Images into Patterns',
        blocks: [
          { type: 'paragraph', text: 'Converting a favorite image into a fuse bead pattern is a core need for most crafters. Master this skill and you\'re no longer limited to ready-made patterns — you can freely create any design you want.' },
          { type: 'heading2', text: 'The Conversion Process' },
          { type: 'numberedList', items: ['Choose your image: prefer images with bold, clear colors and crisp outlines, avoiding too many midtones', 'Adjust the size: crop the image to match the proportions of your target pegboard', 'Reduce colors: use software (like Photoshop, Webp-gif) or online tools (like Beadify) to bring the image down to your target color count', 'Match to the palette: map each pixel of the reduced image to a bead color — this tool can do the conversion automatically', 'Fine-tune: review the auto-converted result and manually adjust any colors that look off'] },
          { type: 'heading2', text: 'Things to Keep in Mind' },
          { type: 'bulletList', items: ['The simpler the image colors, the better the result (cartoon and pixel-art images work best)', 'For photos, try an oil-painting or pop-art filter first, then convert', 'This tool automatically maps to the six supported palettes: COCO, MARD, MARD291, Perler, Hama, and Artkal'] },
          { type: 'callout', variant: 'tip', title: 'Recommended Image Types', text: 'High-contrast cartoons, pixel art, emoji, and simple logos are the easiest to convert. Landscape and portrait photos are much harder — save them for when you\'ve leveled up.' },
          { type: 'keyPoint', text: 'The core of image-to-pattern conversion: pick a simple, high-contrast image → reduce colors → map to brand palette → fine-tune by hand. Using good tools makes the job twice as easy.' }
        ],
        content: '', steps: [], tips: ''
      }
    ]
  },
  {
    id: 'advanced-skills',
    title: 'Advanced Skills',
    icon: '⭐',
    children: [
      {
        id: 'large-grid-joining',
        title: 'Joining Sections for Large Pieces',
        blocks: [
          { type: 'paragraph', text: 'When a piece grows beyond what a single Pegboard can hold, sectioned joining is the only solution. Smart sectioning keeps even large projects looking perfect as a whole.' },
          { type: 'heading2', text: 'Sectioning Principles' },
          { type: 'bulletList', items: ['Keep each section at 57×57 or smaller (a rule of thumb — never exceed 87×87)', 'Cut along color boundaries or natural seams in the design — never slice through important details', 'Leave a 1-2 bead overlap along the joining edges (trim it after ironing) so sections connect firmly', 'Make each section on its own pegboard, then join them at the end'] },
          { type: 'heading2', text: 'How to Join' },
          { type: 'numberedList', items: ['Finish the bead layout and double-sided ironing for each section separately', 'Align the edges to be joined and press the sections tightly together', 'Cover the seam with ironing paper and press gently with the iron at low heat (around 130°C) for 20-30 seconds', 'Flip and repeat so the seam fuses completely', 'After joining, cool the whole piece under weight for at least 30 minutes'] },
          { type: 'callout', variant: 'warning', title: 'Handling the Seams', text: 'Seams are where warping and breaking most often happen. Make sure the joint fuses completely — a few extra seconds of ironing and a longer pressing time are worth it. Ideally, place seams away from the visual focus of the design.' },
          { type: 'keyPoint', text: 'Sectioning rules for large pieces: no section over 57×57, cut along natural boundaries, leave overlap zones, and reinforce seams with low-heat re-ironing.' }
        ],
        content: '', steps: [], tips: ''
      },
      {
        id: 'gradient-technique',
        title: 'Creating Gradients',
        blocks: [
          { type: 'paragraph', text: 'Gradients give fuse bead pieces soft transitions and a richer, more layered look. The key is keeping the color difference between neighboring beads small enough that the eye reads it as a smooth blend.' },
          { type: 'heading2', text: 'The Shade-Step Method' },
          { type: 'paragraph', text: 'A gradient is essentially a series of tiny color steps that fool the eye into seeing smooth change. Prepare several shades of one color family (say, 5-7 colors from dark to light), then arrange them in order.' },
          { type: 'heading2', text: 'Steps' },
          { type: 'numberedList', items: ['Decide the start and end colors of the gradient (for example, dark blue → light blue)', 'Find the intermediate shades that exist in the brand palette between those two', 'Lay the beads from one end to the other in shade order, keeping each step\'s color difference as small as possible', 'The wider the transition zone (the more beads it spans), the more natural the gradient', 'If an intermediate shade is missing, weave in a neighboring color family (like blue + purple + blue)'] },
          { type: 'callout', variant: 'tip', title: 'Perler Gradient Sets', text: 'Perler sells dedicated gradient sets containing 12 shades of one color family from dark to light — a one-stop solution to the gradient shade problem.' },
          { type: 'bulletList', items: ['The smaller the gradient area, the fewer shades you need', 'Horizontal gradients are easier to handle than diagonal ones', 'If a shade is missing, alternating the two neighboring colors eases the visual break'] },
          { type: 'keyPoint', text: 'Gradient essentials: have several shades of the same color family ready (5-7 is ideal), arrange them in shade order, the wider the transition the smoother it is, and horizontal gradients are the easiest.' }
        ],
        content: '', steps: [], tips: ''
      },
      {
        id: 'multi-brand-mix',
        title: 'Mixing Brands',
        blocks: [
          { type: 'paragraph', text: 'Each brand has its own character: Perler has the most colors, Hama is soft and fresh, Artkal\'s metallics are stunning. Mixing brands lets you combine the strengths of each — but a few technical points are worth knowing.' },
          { type: 'heading2', text: 'Why Mix?' },
          { type: 'bulletList', items: ['Pair Perler\'s base colors with Artkal\'s metallic and fluorescent colors', 'Use Hama\'s soft tones for large background areas and Perler\'s vivid colors as accents', 'Expand your overall color range with each brand\'s unique shades'] },
          { type: 'heading2', text: 'Key Technical Points' },
          { type: 'table', headers: ['Watch Out For', 'What It Means', 'How to Handle It'], rows: [
            ['Bead size differences', 'Artkal beads are about 0.3mm finer than Perler/Hama', 'Avoid mixing within the same area, or choose color families of similar size'],
            ['Different ironing temperatures', 'Artkal prefers low heat; Perler/Hama take medium heat', 'Use the lower temperature as the baseline (130°C) and iron for a bit longer'],
            ['Different melting points', 'One brand may over-melt when mixed with another', 'Test on a small area first, and only iron the whole piece once the temperature is confirmed'],
            ['Different aging rates', 'The plastics of different brands age at slightly different speeds', 'For pieces you want to keep long-term, use beads from one brand throughout']
          ] },
          { type: 'callout', variant: 'info', title: 'Best Practice', text: 'Beginners should stick to one brand to build experience before trying to mix. When you do mix, use each brand in its own sections (rather than placing different brands right next to each other) to reduce temperature and size compatibility issues.' },
          { type: 'keyPoint', text: 'The core tricks for mixing brands: use the lowest brand temperature as the baseline (≤130°C), keep brands in separate sections, and test before ironing the whole piece.' }
        ],
        content: '', steps: [], tips: ''
      }
    ]
  },
  {
    id: 'protection',
    title: 'Protecting Your Work',
    icon: '🛡️',
    children: [
      {
        id: 'cooling-shaping',
        title: 'Cooling and Setting',
        blocks: [
          { type: 'paragraph', text: 'The cooling phase after ironing is just as important as the ironing itself — it decides the final flatness and structural strength of the piece. Many mishaps actually happen during cooling.' },
          { type: 'heading2', text: 'Standard Cooling Process' },
          { type: 'numberedList', items: ['After ironing, carefully lift the piece off together with the ironing paper (don\'t remove the paper while the beads are still very hot)', 'Lay the piece face-up on a flat, heat-resistant surface (glass, wood board, or tile all work)', 'Cover with ironing paper, press down with something heavy (books, a cutting board, etc.), about 3-5 kg', 'Keep the weight on and wait at least 30 minutes for the piece to cool to room temperature', 'After 30 minutes you can remove the weight; once fully cool (at least 2 hours), display or store the piece'] },
          { type: 'heading2', text: 'What Affects Cooling Time' },
          { type: 'bulletList', items: ['The bigger the piece, the longer the cooling (allow 1-2 hours for large pieces)', 'Lower room temperature cools faster; higher room temperature cools slower', 'In winter, you can speed cooling near a heater (but avoid direct AC airflow)'] },
          { type: 'callout', variant: 'warning', title: 'Don\'t Peel the Paper Too Early', text: 'Some crafters get impatient and remove the weight and paper 5 minutes after ironing. At that point the beads haven\'t fully set, so even slight movement will warp them. Always wait at least 30 minutes.' },
          { type: 'keyPoint', text: 'Cooling essentials: lay flat, press under weight, and wait at least 30 minutes. Better to press one extra hour than to release the pressure too early.' }
        ],
        content: '', steps: [], tips: ''
      },
      {
        id: 'display-storage',
        title: 'Display and Storage',
        blocks: [
          { type: 'paragraph', text: 'How you display and store a finished piece decides how long it stays with you. With the right care, a piece can keep its colors and shape for decades.' },
          { type: 'heading2', text: 'Display Ideas' },
          { type: 'bulletList', items: ['Acrylic display box: dust-proof, clear, and beautiful on a desk — the most recommended option', 'Wall frame: a glass-fronted frame lets you display and hang the piece — add a moisture barrier to the back', 'Magnetic display: stick a thin magnet strip to the back and attach it to the fridge or any metal surface', 'Floating stand: a clear acrylic stand, great for small pieces'] },
          { type: 'heading2', text: 'Storage Care' },
          { type: 'table', headers: ['Risk', 'Effect', 'Protection'], rows: [
            ['Direct sunlight', 'Colors fade, plastic ages', 'Keep in a shaded spot out of the sun, or use UV-protective glass'],
            ['Damp environments', 'Beads may warp and mold can grow on the surface', 'Use desiccants during the humid rainy season'],
            ['High temperatures', 'Plastic softens and beads fall off', 'Don\'t keep pieces near heaters or in cars'],
            ['Dust buildup', 'The surface loses its shine', 'Wipe gently with a soft cloth from time to time — never wash with water']
          ] },
          { type: 'callout', variant: 'tip', title: 'Long-Term Storage Advice', text: 'For especially precious pieces, seal them in an airtight bag with a desiccant and store in a cool place. This effectively slows plastic aging and keeps colors vivid.' },
          { type: 'keyPoint', text: 'Piece care essentials: avoid light (prevents fading), moisture (prevents warping), dust (keeps the shine), and high temperatures (slows aging). An acrylic box is the best display container.' }
        ],
        content: '', steps: [], tips: ''
      }
    ]
  }
]
