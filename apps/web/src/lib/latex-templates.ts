/**
 * Built-in LaTeX resume templates for Resume Studio. Plain article class +
 * common packages only, so Tectonic compiles them out of the box with no
 * shell-escape and no exotic font packages.
 */

/** A clean one-page CS-student resume in the style of the well-known "Jake's Resume". */
export const JAKES_RESUME_TEMPLATE = String.raw`\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}[leftmargin=0.15in]}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

\begin{document}

%----------HEADING----------
\begin{center}
    \textbf{\Huge \scshape Jane Doe} \\ \vspace{1pt}
    \small 555-123-4567 $|$ \href{mailto:jane.doe@example.com}{\underline{jane.doe@example.com}} $|$
    \href{https://linkedin.com/in/janedoe}{\underline{linkedin.com/in/janedoe}} $|$
    \href{https://github.com/janedoe}{\underline{github.com/janedoe}}
\end{center}

%-----------EDUCATION-----------
\section{Education}
  \resumeSubHeadingListStart
    \resumeSubheading
      {University of Example}{Example City, ST}
      {B.S. in Computer Science, GPA: 3.8/4.0}{Aug. 2023 -- May 2027}
  \resumeSubHeadingListEnd

%-----------EXPERIENCE-----------
\section{Experience}
  \resumeSubHeadingListStart

    \resumeSubheading
      {Software Engineering Intern}{Summer 2026}
      {Example Tech Company}{Example City, ST}
      \resumeItemListStart
        \resumeItem{Built and shipped a feature used by over 10,000 daily active users, cutting page-load time by 30\%.}
        \resumeItem{Collaborated with a team of 5 engineers using Git, code review, and agile sprints.}
        \resumeItem{Wrote unit and integration tests, increasing coverage of the module from 40\% to 85\%.}
      \resumeItemListEnd

    \resumeSubheading
      {Undergraduate Research Assistant}{Jan. 2025 -- Present}
      {University of Example, Computer Science Department}{Example City, ST}
      \resumeItemListStart
        \resumeItem{Implemented a data pipeline in Python processing over 1M records for a machine learning study.}
        \resumeItem{Co-authored a paper submitted to a peer-reviewed undergraduate research conference.}
      \resumeItemListEnd

  \resumeSubHeadingListEnd

%-----------PROJECTS-----------
\section{Projects}
    \resumeSubHeadingListStart
      \resumeProjectHeading
          {\textbf{Task Tracker} $|$ \emph{React, Node.js, PostgreSQL}}{Spring 2026}
          \resumeItemListStart
            \resumeItem{Developed a full-stack task-tracking web app with authentication and real-time updates.}
            \resumeItem{Deployed on a cloud platform with CI/CD via GitHub Actions.}
          \resumeItemListEnd
      \resumeProjectHeading
          {\textbf{Pathfinding Visualizer} $|$ \emph{JavaScript, HTML/CSS}}{Fall 2025}
          \resumeItemListStart
            \resumeItem{Built an interactive visualizer for Dijkstra's and A* search algorithms.}
          \resumeItemListEnd
    \resumeSubHeadingListEnd

%-----------TECHNICAL SKILLS-----------
\section{Technical Skills}
 \begin{itemize}[leftmargin=0.15in, label={}]
    \small{\item{
     \textbf{Languages}{: Python, Java, C++, JavaScript, SQL} \\
     \textbf{Frameworks}{: React, Node.js, Express, Flask} \\
     \textbf{Developer Tools}{: Git, Docker, VS Code, Linux} \\
     \textbf{Libraries}{: pandas, NumPy, scikit-learn}
    }}
 \end{itemize}

\end{document}
`;
