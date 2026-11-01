# Gera public/guia-contas.pdf a partir de src/content/guide.ts.
# 1) node scripts/dump-guide.cjs   2) python3 scripts/build-guide-pdf.py   (requer reportlab e fontes Liberation)
import json,re
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, KeepTogether, PageBreak, Table, TableStyle, Flowable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

F='/usr/share/fonts/truetype/liberation/'
pdfmetrics.registerFont(TTFont('Sans',F+'LiberationSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Sans-B',F+'LiberationSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Serif-B',F+'LiberationSerif-Bold.ttf'))
pdfmetrics.registerFontFamily('Sans',normal='Sans',bold='Sans-B',italic='Sans',boldItalic='Sans-B')

INK=colors.HexColor('#14213d'); MUTED=colors.HexColor('#5b6b82'); TIDE=colors.HexColor('#1f8a8a'); TIDE_D=colors.HexColor('#176e6e')
ICE=colors.HexColor('#e6edf5'); CLAY=colors.HexColor('#d9573b'); HONEY=colors.HexColor('#e8a21c'); SOFT=colors.HexColor('#d3ebeb'); PLUM=colors.HexColor('#6b4c8a')

data=json.load(open('scripts/.guide.json'))
GUIDE={s['id']:s for s in data['GUIDE']}

def rich(t):
    t=t.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
    t=re.sub(r'\[\[([^\]|]+)(?:\|[^\]]*)?\]\]',r'\1',t)
    return re.sub(r'\*\*([^*]+)\*\*',r'<b>\1</b>',t)

body=ParagraphStyle('body',fontName='Sans',fontSize=10,leading=14.5,textColor=colors.HexColor('#2b3a55'),spaceAfter=5)
h1=ParagraphStyle('h1',fontName='Serif-B',fontSize=20,leading=24,textColor=INK,spaceBefore=4,spaceAfter=2)
kick=ParagraphStyle('kick',fontName='Sans-B',fontSize=8.5,leading=11,textColor=TIDE_D,spaceAfter=2)
sumry=ParagraphStyle('sum',fontName='Sans',fontSize=10.5,leading=14,textColor=MUTED,spaceAfter=8)
h3=ParagraphStyle('h3',fontName='Sans-B',fontSize=11.5,leading=15,textColor=INK,spaceBefore=8,spaceAfter=3)
bul=ParagraphStyle('bul',parent=body,leftIndent=12,bulletIndent=2,spaceAfter=3)
step=ParagraphStyle('step',parent=body,leftIndent=18,spaceAfter=4)
tipS=ParagraphStyle('tip',parent=body,textColor=INK,spaceAfter=0)

class Beads(Flowable):
    def __init__(self,w=40*mm,h=12*mm,line=INK): super().__init__(); self.width=w; self.height=h; self.line=line
    def draw(self):
        c=self.canv; s=self.width/120.0
        c.setStrokeColor(self.line); c.setLineWidth(3*s); c.setLineCap(1)
        y=self.height/2
        c.line(4*s,y,116*s,y)
        for cx,r,col in [(26,19,CLAY),(62,14,HONEY),(92,10,TIDE)]:
            c.setFillColor(col); c.setStrokeColor(col); c.circle(cx*s,y,r*s,stroke=0,fill=1)

class Example(Flowable):
    def __init__(self,text,items,width):
        super().__init__(); self.width=width
        self.label=Paragraph('EXEMPLO: A MARTA',ParagraphStyle('el',fontName='Sans-B',fontSize=7.5,leading=10,textColor=PLUM))
        self.paras=[Paragraph(rich(text),tipS)]+[Paragraph(rich(i),bul,bulletText='\u2022') for i in (items or [])]
        iw=width-9*mm
        self.hs=[]
        h=3*mm
        _,lh=self.label.wrap(iw,1000); h+=lh+2
        for p in self.paras:
            _,ph=p.wrap(iw,1000); self.hs.append(ph); h+=ph+2
        self.height=h+3*mm
    def draw(self):
        c=self.canv
        c.setFillColor(colors.HexColor('#f1ecf6')); c.roundRect(0,0,self.width,self.height,3*mm,stroke=0,fill=1)
        c.setFillColor(PLUM); c.rect(0,0,1.6*mm,self.height,stroke=0,fill=1)
        y=self.height-3*mm
        iw=self.width-9*mm
        _,lh=self.label.wrap(iw,1000); y-=lh; self.label.drawOn(c,5*mm,y); y-=2
        for p,ph in zip(self.paras,self.hs):
            p.wrap(iw,1000); y-=ph; p.drawOn(c,5*mm,y); y-=2

class Tip(Flowable):
    def __init__(self,text,width):
        super().__init__(); self.p=Paragraph(rich(text),tipS); self.w=width
        self.pw,self.ph=self.p.wrap(width-8*mm,1000); self.width=width; self.height=self.ph+6*mm
    def draw(self):
        c=self.canv; c.setFillColor(SOFT); c.roundRect(0,0,self.width,self.height,3*mm,stroke=0,fill=1)
        c.setFillColor(TIDE); c.rect(0,0,1.6*mm,self.height,stroke=0,fill=1)
        self.p.drawOn(c,5*mm,3*mm)

W=A4[0]-40*mm
def blocks(bl):
    out=[]
    for b in bl:
        if b['t']=='p': out.append(Paragraph(rich(b['text']),body))
        elif b['t']=='list':
            for it in b['items']: out.append(Paragraph(rich(it),bul,bulletText='•'))
        elif b['t']=='steps':
            for i,it in enumerate(b['items'],1): out.append(Paragraph(rich(it),step,bulletText=f'{i}.'))
        elif b['t']=='example':
            out.append(Spacer(1,2)); out.append(Example(b['text'],b.get('items'),W)); out.append(Spacer(1,6))
        elif b['t']=='tip':
            out.append(Spacer(1,2)); out.append(Tip(b['text'],W)); out.append(Spacer(1,6))
    return out

def footer(c,doc):
    c.saveState()
    c.setFont('Sans',8); c.setFillColor(MUTED)
    c.drawString(20*mm,12*mm,'Guia da Contas (versão simples)')
    c.drawRightString(A4[0]-20*mm,12*mm,str(doc.page))
    c.restoreState()

def cover(c,doc):
    c.saveState(); c.setFillColor(ICE); c.rect(0,0,A4[0],A4[1],stroke=0,fill=1); c.restoreState()

doc=BaseDocTemplate('public/guia-contas.pdf',pagesize=A4,leftMargin=20*mm,rightMargin=20*mm,topMargin=20*mm,bottomMargin=20*mm,
    title='Guia da Contas (versão simples)',author='Contas')
frame=Frame(20*mm,20*mm,W,A4[1]-40*mm,id='f',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)
doc.addPageTemplates([PageTemplate(id='cover',frames=[frame],onPage=cover),PageTemplate(id='body',frames=[frame],onPage=footer)])

from reportlab.platypus import NextPageTemplate
st=[]
st+= [Spacer(1,60*mm),Beads(60*mm,18*mm),Spacer(1,10*mm),
      Paragraph('Guia da Contas',ParagraphStyle('t',fontName='Serif-B',fontSize=38,leading=42,textColor=INK)),
      Spacer(1,4*mm),
      Paragraph('Versão simples: o essencial para usar a app no dia a dia.',ParagraphStyle('s',fontName='Sans',fontSize=14,leading=19,textColor=MUTED)),
      Spacer(1,90*mm),
      Paragraph('O guia completo, com a parte avançada, está na app em Guia.',ParagraphStyle('n',fontName='Sans',fontSize=10,leading=14,textColor=MUTED)),
      NextPageTemplate('body'),PageBreak()]

for sid in ['comecar','usar']:
    s=GUIDE[sid]
    head=[Paragraph(s['kicker'].upper(),kick),Paragraph(s['title'],h1),Paragraph(s['summary'],sumry)]
    first=blocks(s['blocks'])
    st.append(KeepTogether(head+first[:2]))
    st+=first[2:]
    for sub in s.get('subs',[]):
        bl=blocks(sub['blocks'])
        st.append(KeepTogether([Paragraph(sub['title'],h3)]+bl[:2]))
        st+=bl[2:]
    st.append(Spacer(1,10))

st.append(PageBreak())
st+=[Paragraph('GLOSSÁRIO',kick),Paragraph('Palavras que a app usa',h1),Spacer(1,6)]
rows=[[Paragraph('<b>'+rich(g['term'])+'</b>',body),Paragraph(rich(g['def']),body)] for g in sorted(data['GLOSSARY'],key=lambda g:g['term'].lower())]
t=Table(rows,colWidths=[38*mm,W-38*mm])
t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),0.4,colors.HexColor('#d5dee9')),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),3)]))
st.append(t)
doc.build(st)
print('built')
