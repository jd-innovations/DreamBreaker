import sys
from PIL import Image
for f in sys.argv[1:]:
    im = Image.open(f).convert('RGB')
    if im.size != (1320, 2868):
        im.resize((1320, 2868), Image.LANCZOS).save(f, optimize=True)
