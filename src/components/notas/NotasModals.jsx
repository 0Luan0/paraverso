/**
 * NotasModals.jsx — Modal rendering for folder actions
 *
 * Renders InputModal, ConfirmModal, and FolderPicker based on
 * the folderModal state object from NotasTab.
 */

import { InputModal, ConfirmModal, FolderPicker } from '../ui/Modals'

export function NotasModals({ folderModal, setFolderModal, cadernos }) {
  if (!folderModal) return null

  return (
    <>
      {folderModal.type === 'input' && (
        <InputModal
          title={folderModal.title}
          placeholder={folderModal.placeholder}
          defaultValue={folderModal.defaultValue}
          onConfirm={folderModal.onConfirm}
          onCancel={() => setFolderModal(null)}
        />
      )}
      {folderModal.type === 'confirm' && (
        <ConfirmModal
          message={folderModal.message}
          confirmLabel={folderModal.confirmLabel}
          onConfirm={folderModal.onConfirm}
          onCancel={() => setFolderModal(null)}
        />
      )}
      {folderModal.type === 'picker' && (
        <FolderPicker
          cadernos={cadernos}
          excludePath={folderModal.folderPath}
          onConfirm={folderModal.onConfirm}
          onCancel={() => setFolderModal(null)}
        />
      )}
    </>
  )
}
