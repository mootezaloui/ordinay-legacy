import ContentSection from "../../layout/ContentSection";

/**
 * Documents Tab - Displays and manages documents
 * Works for any entity with a documents array
 */
export default function DocumentsTab({ data, config }) {
  const documents = data.documents || [];

  const getFileIcon = (type) => {
    if (type === 'pdf') return 'fas fa-file-pdf text-red-600 dark:text-red-400';
    if (type === 'docx' || type === 'doc') return 'fas fa-file-word text-blue-600 dark:text-blue-400';
    if (type === 'xlsx' || type === 'xls') return 'fas fa-file-excel text-green-600 dark:text-green-400';
    if (type === 'jpg' || type === 'png' || type === 'jpeg') return 'fas fa-file-image text-purple-600 dark:text-purple-400';
    return 'fas fa-file text-slate-600 dark:text-slate-400';
  };

  const handleDownload = (doc) => {
    console.log("Downloading document:", doc);
    // TODO: Implement actual download
    alert(`Téléchargement de ${doc.name}`);
  };

  const handleAddDocument = () => {
    console.log("Adding document");
    // TODO: Implement document upload
    alert("Fonctionnalité d'ajout de document à venir");
  };

  if (documents.length === 0) {
    return (
      <ContentSection title={`Documents (0)`}>
        <div className="p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
            <i className="fas fa-file text-slate-400 dark:text-slate-600 text-2xl"></i>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Aucun document
          </p>
          <button
            onClick={handleAddDocument}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <i className="fas fa-plus mr-2"></i>
            Ajouter un document
          </button>
        </div>
      </ContentSection>
    );
  }

  return (
    <ContentSection title={`Documents (${documents.length})`}>
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 transition-colors cursor-pointer group"
            >
              <div className="flex items-start gap-3">
                <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg flex-shrink-0">
                  <i className={`${getFileIcon(doc.type)} text-xl`}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {doc.name}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{doc.size}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{doc.date}</span>
                  </div>
                  {doc.category && (
                    <span className="inline-block mt-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs rounded">
                      {doc.category}
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(doc);
                  }}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  title="Télécharger"
                >
                  <i className="fas fa-download text-slate-600 dark:text-slate-400"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
        
        <button
          onClick={handleAddDocument}
          className="mt-6 w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-500 rounded-lg text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <i className="fas fa-plus mr-2"></i>
          Ajouter un document
        </button>
      </div>
    </ContentSection>
  );
}