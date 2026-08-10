import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { G, Path } from 'react-native-svg';
import { colors, spacing, radius } from '@/theme';
import { OnboardingCTA, OnboardingProgressBar } from '@/lib/onboarding/components';
import { useOnboarding } from '@/lib/onboarding/state';

const L = colors;
const SCREEN_BG = '#F8F5EF';
type GenderKey = 'male' | 'female' | 'prefer_not_to_say';
type HandednessKey = 'right_handed' | 'left_handed' | 'ambidextrous';

const GENDER_OPTIONS: { key: GenderKey; label: string }[] = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const HANDEDNESS_OPTIONS: { key: HandednessKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'right_handed', label: 'Right handed', icon: 'hand-right-outline' },
  { key: 'left_handed', label: 'Left handed', icon: 'hand-left-outline' },
  { key: 'ambidextrous', label: 'Ambidextrous', icon: 'swap-horizontal-outline' },
];

// Screen 3 - Gender. Optional, with a default selection for a fast setup path.
export default function GenderScreen() {
  const insets = useSafeAreaInsets();
  const { draft, update } = useOnboarding();

  function next() {
    router.push('/onboarding/area-recommendations');
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}> 
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} activeOpacity={0.7} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <TouchableOpacity style={s.skipBtn} activeOpacity={0.7} onPress={next}>
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={s.content}>
        <View style={s.titleBlock}>
          <Text style={s.title}>What is your gender?</Text>
          <Text style={s.subtitle}>This helps us personalize your partner recommendations.</Text>
        </View>

        <View style={s.optionList}>
          {GENDER_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[s.optionCard, draft.gender === opt.key && s.optionCardSelected]}
              activeOpacity={0.78}
              onPress={() => update('gender', opt.key)}
            >
              <View style={s.optionLeft}>
                <GenderOptionIcon option={opt.key} />
                <Text style={s.optionText}>{opt.label}</Text>
              </View>
              <View style={[s.radio, draft.gender === opt.key && s.radioSelected]}>
                {draft.gender === opt.key && <Ionicons name="checkmark" size={14} color={L.white} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.handednessBlock}>
          <Text style={s.sectionTitle}>Which hand do you play with?</Text>
          <View style={s.optionList}>
            {HANDEDNESS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[s.optionCard, draft.handedness === opt.key && s.optionCardSelected]}
                activeOpacity={0.78}
                onPress={() => update('handedness', opt.key)}
              >
                <View style={s.optionLeft}>
                  <Ionicons name={opt.icon} size={28} color={L.gold} />
                  <Text style={s.optionText}>{opt.label}</Text>
                </View>
                <View style={[s.radio, draft.handedness === opt.key && s.radioSelected]}>
                  {draft.handedness === opt.key && <Ionicons name="checkmark" size={14} color={L.white} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <OnboardingProgressBar progress={27} />
        <OnboardingCTA label="Continue" onPress={next} />
      </View>
    </View>
  );
}

function GenderOptionIcon({ option }: { option: GenderKey }) {
  if (option === 'male') return <ShortsIcon />;
  if (option === 'female') return <SkirtIcon />;
  return <PaddleIcon />;
}

function ShortsIcon() {
  return (
    <Svg width={30} height={30} viewBox="70 110 335 270">
      <G transform="translate(0,448) scale(0.1,-0.1)" fill={L.gold} stroke="none">
        <Path d="M1351 3262 c-24 -21 -80 -167 -91 -239 -6 -33 -29 -89 -63 -150 -69 -126 -78 -152 -177 -493 -46 -157 -91 -314 -102 -350 -10 -36 -27 -114 -38 -175 -35 -200 -62 -320 -76 -336 -9 -9 -14 -39 -14 -76 0 -33 -5 -85 -11 -116 -19 -93 -7 -104 204 -203 204 -96 275 -122 407 -154 150 -35 379 -110 455 -148 68 -34 74 -36 203 -39 l133 -4 29 29 c18 18 35 51 45 88 9 32 27 88 42 124 14 36 36 93 48 127 l22 63 47 -188 c26 -103 54 -201 61 -218 18 -43 62 -50 146 -25 35 10 91 22 124 26 33 3 94 15 135 25 41 10 102 21 135 24 33 3 103 19 155 35 52 16 163 50 245 76 83 26 180 56 217 67 85 25 197 92 274 161 l58 54 4 75 c4 64 -3 105 -49 289 -67 276 -144 540 -204 704 -82 223 -133 386 -161 505 -30 131 -53 308 -47 361 9 70 -31 83 -158 50 -328 -87 -860 -127 -1204 -93 -229 23 -462 61 -502 82 -46 24 -138 46 -215 53 -45 4 -62 2 -77 -11z m172 -97 c32 -8 76 -24 97 -35 60 -31 472 -85 725 -97 151 -6 590 20 710 42 161 30 291 55 316 61 25 5 27 3 37 -43 6 -26 13 -73 14 -103 l3 -55 -35 -1 c-63 -1 -123 -16 -275 -69 -147 -51 -152 -52 -291 -57 l-140 -5 -16 28 c-9 15 -35 40 -59 56 -35 23 -53 28 -103 28 -36 -1 -73 -7 -91 -17 -28 -15 -32 -15 -72 9 -74 43 -138 31 -218 -41 l-40 -35 -105 6 c-68 3 -137 14 -195 30 -49 14 -132 29 -183 33 -85 8 -98 12 -173 56 -80 46 -81 48 -76 81 3 19 17 58 31 88 29 63 39 66 139 40z m-130 -297 c18 -14 17 -19 -22 -142 -23 -71 -50 -173 -61 -227 -11 -54 -40 -153 -66 -221 -26 -69 -61 -192 -80 -282 -19 -88 -43 -188 -54 -222 -10 -34 -24 -91 -30 -126 -15 -83 -41 -168 -53 -168 -5 0 -33 7 -63 16 -63 18 -63 16 -34 149 11 50 27 135 36 190 9 55 38 174 65 265 28 91 75 252 105 358 61 213 74 249 140 369 l45 83 27 -14 c15 -8 35 -21 45 -28z m915 -41 c24 -19 -5 -34 -53 -27 -58 9 -63 15 -28 34 28 15 57 13 81 -7z m1178 -122 c18 -72 46 -168 64 -215 115 -305 202 -579 241 -755 10 -49 30 -130 42 -180 26 -98 25 -99 -34 -110 l-36 -7 -23 79 c-12 43 -44 132 -70 198 -67 171 -111 369 -181 830 -18 118 -44 231 -64 279 -6 14 -4 17 11 14 14 -2 24 -30 50 -133z m-936 110 c17 -9 30 -18 30 -20 0 -9 -105 -5 -120 5 -13 9 -13 11 0 20 22 14 57 12 90 -5z m803 -62 c14 -43 30 -118 36 -168 7 -49 19 -120 26 -156 8 -36 21 -112 30 -169 40 -266 82 -440 142 -585 39 -95 83 -225 83 -247 0 -4 -10 -10 -22 -13 -13 -4 -50 -17 -83 -30 -33 -12 -112 -30 -175 -39 -168 -25 -249 -48 -503 -142 -212 -79 -306 -108 -366 -116 -23 -3 -26 4 -56 102 -17 58 -40 121 -50 140 -21 39 -24 99 -11 231 10 102 0 213 -21 234 -19 20 -48 19 -68 -1 -13 -14 -15 -26 -8 -68 4 -28 7 -69 6 -91 -6 -186 -16 -306 -28 -363 -13 -66 -52 -182 -60 -182 -22 0 -201 48 -280 74 -55 19 -127 42 -160 51 -33 9 -94 31 -135 49 -41 18 -145 54 -230 80 -224 70 -300 97 -300 107 0 5 7 26 15 45 8 20 22 73 30 119 9 46 25 114 36 151 11 38 35 139 53 224 19 85 48 191 66 235 40 100 54 145 79 265 11 52 37 147 57 211 l37 116 76 -4 c42 -2 117 -16 166 -30 57 -17 125 -28 188 -31 53 -2 97 -5 97 -6 0 0 -9 -25 -20 -54 -24 -62 -25 -93 -6 -130 31 -59 130 -75 201 -33 l38 22 -7 -23 c-4 -13 -15 -61 -26 -108 -11 -47 -25 -106 -31 -132 -13 -59 -5 -86 28 -94 36 -9 59 21 68 88 17 134 115 444 129 408 19 -50 88 -275 100 -330 9 -36 16 -84 16 -107 0 -29 6 -49 19 -62 23 -23 59 -17 70 11 9 26 -6 152 -28 233 l-18 65 39 0 c32 0 46 6 68 30 27 29 50 100 50 154 0 20 7 25 40 30 22 3 77 4 122 0 82 -5 85 -5 253 55 94 33 178 60 187 60 13 1 23 -19 41 -76z m-1154 -35 c28 -6 51 -15 51 -19 0 -14 -100 -97 -126 -103 -56 -14 -66 31 -22 102 22 36 26 37 97 20z m421 -35 c0 -10 -5 -35 -11 -56 -10 -36 -12 -38 -28 -23 -9 8 -27 34 -40 56 l-22 40 50 0 c42 0 51 -3 51 -17z m-1666 -1279 c33 -9 106 -33 161 -54 55 -21 181 -64 280 -96 99 -31 201 -67 227 -80 26 -13 74 -31 105 -39 32 -8 112 -33 178 -54 66 -22 156 -47 200 -57 44 -9 81 -17 82 -18 3 -3 -16 -76 -29 -108 -10 -27 -11 -27 -107 -26 -88 1 -103 4 -181 38 -111 50 -269 102 -411 136 -63 15 -143 37 -179 49 -66 23 -388 170 -403 185 -9 8 1 140 10 140 3 0 33 -7 67 -16z m2922 -81 c-3 -28 -13 -45 -42 -70 -80 -69 -239 -152 -290 -153 -12 0 -111 -29 -220 -65 -241 -78 -306 -95 -360 -95 -23 0 -60 -7 -83 -15 -23 -8 -88 -21 -146 -30 -57 -8 -116 -20 -130 -25 -46 -17 -52 -12 -68 52 -9 34 -15 64 -13 65 1 2 45 14 97 27 52 13 193 61 314 106 221 82 357 119 515 140 46 6 111 23 145 37 62 25 208 61 258 62 26 1 27 -1 23 -36z" />
      </G>
    </Svg>
  );
}

function SkirtIcon() {
  return (
    <Svg width={30} height={30} viewBox="80 105 365 260">
      <G transform="translate(0,448) scale(0.1,-0.1)" fill={L.gold} stroke="none">
        <Path d="M3360 3314 c-91 -7 -205 -17 -255 -23 -49 -6 -128 -11 -175 -11 -47 0 -126 -7 -176 -15 -146 -24 -495 -30 -644 -11 -69 9 -195 23 -280 31 -85 8 -171 19 -190 25 -52 15 -68 12 -94 -13 -30 -30 -52 -183 -39 -267 10 -63 6 -81 -47 -200 -21 -47 -64 -170 -96 -275 -82 -272 -179 -546 -229 -645 -23 -47 -58 -123 -78 -170 -19 -47 -50 -119 -70 -160 -19 -41 -42 -97 -52 -125 -10 -27 -27 -59 -37 -71 -41 -46 -14 -86 95 -138 65 -31 84 -35 192 -41 66 -4 120 -7 120 -8 8 -23 47 -64 94 -100 78 -58 191 -101 309 -118 87 -12 100 -11 239 13 l146 27 31 -23 c53 -40 93 -56 188 -76 109 -24 155 -25 268 -6 211 36 318 66 345 97 14 15 26 18 52 13 30 -6 198 -12 468 -17 122 -2 169 18 276 119 72 68 94 84 119 84 73 0 228 60 307 119 65 49 83 75 83 121 0 59 -103 319 -219 555 -138 279 -191 399 -273 620 -66 177 -84 252 -98 400 -10 105 -34 212 -57 257 -11 23 -44 51 -55 47 -2 -1 -77 -8 -168 -15z m165 -126 c9 -29 19 -92 22 -139 l6 -86 -154 -5 c-128 -5 -190 -13 -364 -47 l-210 -42 -263 0 c-366 1 -658 24 -770 60 -35 11 -92 26 -127 32 -62 10 -63 11 -69 47 -8 48 -8 118 0 176 6 38 10 46 23 40 9 -4 113 -18 231 -31 287 -33 744 -43 885 -19 51 9 128 16 171 16 44 0 124 5 179 11 55 6 170 16 255 23 85 8 158 14 162 15 4 0 15 -23 23 -51z m-1757 -339 c30 -11 109 -26 175 -34 145 -18 728 -39 845 -31 45 3 176 25 290 47 180 36 226 42 351 43 l145 1 12 -60 c14 -68 109 -329 179 -491 25 -60 100 -217 165 -349 69 -138 141 -300 170 -383 27 -78 50 -144 50 -147 0 -27 -165 -125 -211 -125 -11 0 -29 -5 -40 -11 -12 -6 -40 -13 -64 -15 -40 -5 -43 -3 -50 23 -3 15 -28 78 -55 138 -45 103 -94 255 -222 689 -41 142 -57 181 -75 193 -21 14 -25 14 -44 -3 -24 -21 -24 -19 24 -174 19 -63 51 -169 70 -235 81 -279 117 -387 167 -499 29 -66 55 -135 57 -155 5 -33 1 -40 -55 -93 -76 -73 -141 -94 -246 -82 -39 4 -144 7 -233 5 l-161 -2 -11 53 c-6 29 -16 109 -21 178 -13 163 -37 394 -56 545 -9 66 -20 168 -24 228 -7 108 -22 147 -55 147 -44 0 -48 -91 -15 -320 17 -120 31 -252 70 -658 6 -61 13 -118 16 -126 3 -8 -12 -32 -33 -54 -31 -32 -49 -42 -98 -52 -33 -6 -96 -20 -140 -30 -135 -31 -199 -33 -303 -11 -109 24 -170 54 -179 89 -3 14 0 68 7 121 7 53 16 209 20 346 5 138 16 301 24 362 17 124 19 261 3 281 -13 17 -37 15 -59 -5 -15 -13 -18 -33 -19 -117 0 -56 -5 -126 -10 -156 -5 -30 -13 -172 -19 -315 -6 -143 -16 -314 -23 -380 l-12 -120 -115 -23 c-163 -32 -297 -22 -425 33 -54 23 -122 71 -140 99 -14 21 -13 26 5 62 45 89 119 297 148 414 17 69 47 170 68 225 50 136 81 251 89 328 7 63 6 66 -19 82 -25 17 -28 17 -46 0 -14 -12 -20 -31 -20 -59 0 -60 -33 -187 -84 -328 -25 -67 -57 -172 -71 -233 -15 -60 -44 -154 -66 -209 -21 -54 -39 -102 -39 -107 0 -5 -10 -30 -22 -56 l-22 -46 -124 6 c-101 6 -131 11 -163 29 -31 17 -38 26 -33 42 17 58 182 442 234 547 48 95 96 230 214 604 73 231 109 326 137 361 12 14 116 -1 187 -27z" />
      </G>
    </Svg>
  );
}

function PaddleIcon() {
  return (
    <Svg width={30} height={30} viewBox="135 25 260 365">
      <G transform="translate(0,448) scale(0.1,-0.1)" fill={L.gold} stroke="none">
        <Path d="M2273 4090 c-126 -27 -202 -119 -374 -452 -54 -103 -107 -201 -119 -218 -71 -99 -219 -483 -251 -652 -31 -162 -24 -265 24 -375 32 -74 110 -199 175 -277 13 -16 51 -84 84 -150 57 -113 60 -123 48 -151 -7 -16 -16 -66 -20 -110 -10 -103 -50 -270 -88 -366 -17 -42 -38 -101 -47 -131 -10 -34 -39 -88 -74 -136 -115 -160 -132 -236 -74 -330 43 -69 98 -91 278 -107 68 -6 72 -5 119 27 75 50 84 68 101 201 17 125 28 165 98 347 24 63 55 149 68 190 22 69 27 77 64 95 27 14 47 34 64 65 32 62 107 107 209 126 259 49 319 66 412 111 114 55 190 126 273 253 116 179 193 344 287 615 29 82 65 179 82 215 16 36 39 90 49 120 33 93 69 295 69 387 0 75 -3 92 -26 132 -15 25 -34 54 -43 65 -23 27 -116 88 -223 147 -148 83 -161 89 -290 134 -217 77 -281 102 -363 144 -143 74 -175 82 -330 86 -77 3 -159 0 -182 -5z m390 -129 c42 -17 94 -42 115 -56 21 -13 69 -36 107 -49 275 -97 386 -140 434 -169 31 -19 65 -37 75 -41 11 -4 57 -30 104 -58 146 -88 161 -133 121 -358 -24 -134 -42 -193 -90 -308 -22 -51 -64 -162 -93 -245 -99 -280 -197 -481 -313 -635 -105 -141 -231 -202 -518 -247 -55 -9 -128 -28 -163 -42 -59 -23 -101 -25 -87 -3 3 5 34 25 68 44 58 32 276 96 327 96 34 0 162 55 234 100 36 23 83 61 104 85 59 68 311 582 362 740 108 334 119 556 35 674 -28 39 -54 59 -123 96 -48 25 -125 69 -172 97 -105 62 -204 109 -301 142 -41 14 -117 41 -169 61 -112 42 -182 61 -275 74 -60 9 -75 8 -110 -8 -150 -69 -355 -380 -549 -836 -119 -279 -147 -444 -107 -623 28 -123 36 -141 122 -269 76 -114 189 -322 189 -348 0 -42 -30 -3 -75 97 -30 67 -81 154 -128 220 -107 151 -125 181 -153 255 -30 80 -34 202 -9 323 32 159 154 468 239 609 20 32 73 132 119 222 121 239 215 372 274 384 15 4 33 9 38 11 6 2 73 2 150 0 129 -3 146 -6 218 -35z m-108 -121 c39 -10 102 -31 140 -45 39 -15 106 -39 150 -55 119 -42 150 -56 267 -123 59 -34 145 -82 190 -107 114 -62 136 -95 144 -215 8 -122 -26 -292 -103 -510 -30 -85 -217 -472 -283 -584 -64 -111 -187 -185 -367 -221 -55 -11 -120 -27 -143 -35 -23 -8 -50 -15 -60 -15 -30 0 -138 -60 -189 -106 l-49 -44 -64 30 c-34 16 -68 30 -73 30 -14 0 -31 30 -40 70 -11 53 -97 214 -184 347 -101 153 -95 141 -121 262 -17 79 -21 119 -16 169 10 96 49 237 94 338 22 49 63 143 92 209 59 135 71 157 184 340 103 168 124 194 199 250 59 45 63 47 112 40 28 -3 82 -14 120 -25z m-474 -2089 c43 -14 194 -85 207 -96 2 -1 -5 -18 -14 -38 -15 -31 -22 -35 -65 -40 -41 -5 -60 0 -136 33 -48 22 -98 40 -109 40 -39 0 -44 103 -6 113 36 10 71 6 123 -12z m-20 -237 c46 -21 85 -38 87 -39 1 -1 -3 -16 -9 -33 -13 -39 -29 -40 -96 -7 -43 22 -133 104 -133 122 0 13 72 -8 151 -43z m-133 -116 c20 -17 65 -44 99 -60 64 -29 69 -33 54 -56 -6 -10 -21 -11 -72 -3 -35 6 -82 11 -104 11 -64 0 -68 7 -43 78 13 34 25 62 27 62 2 0 20 -14 39 -32z m29 -204 c75 -7 86 -17 67 -65 l-15 -35 -104 50 c-58 28 -105 55 -105 59 0 5 21 6 48 3 26 -3 75 -8 109 -12z m-115 -120 c58 -22 107 -54 82 -54 -18 0 -177 30 -181 34 -6 6 16 46 25 46 3 0 37 -12 74 -26z m-27 -129 c89 -16 103 -20 93 -30 -7 -7 -137 19 -198 40 -48 16 -45 15 105 -10z m-2 -111 c154 -32 167 -44 100 -88 -35 -22 -43 -23 -112 -15 -41 4 -87 11 -102 14 -38 9 -79 59 -79 97 0 35 -18 36 193 -8z" />
      </G>
    </Svg>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  skipBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm },
  skipText: { color: L.gold, fontSize: 14, fontWeight: '800' },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
    justifyContent: 'center',
  },
  titleBlock: { alignItems: 'center', marginBottom: spacing.xl },
  title: { color: L.navy, fontSize: 30, fontWeight: '900', lineHeight: 36, textAlign: 'center' },
  subtitle: { color: '#39415A', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: spacing.sm, maxWidth: 280 },
  optionList: { gap: spacing.sm },
  optionCard: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: '#E5DED1',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  optionCardSelected: { borderColor: L.gold, backgroundColor: 'rgba(255,255,255,0.9)' },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  optionText: { color: L.navy, fontSize: 14, fontWeight: '800' },
  handednessBlock: { marginTop: spacing.xl },
  sectionTitle: { color: L.navy, fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: spacing.md },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#7C8494',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: L.gold, backgroundColor: L.gold },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: SCREEN_BG,
    gap: spacing.md,
  },
});
