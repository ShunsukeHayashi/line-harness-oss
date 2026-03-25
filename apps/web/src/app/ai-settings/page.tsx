'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import Header from '@/components/layout/header'
import type { AiSettings } from '@line-crm/shared'

const DEFAULT_MODEL = 'claude-haiku-4-5'

const MODEL_OPTIONS = [
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (高速・低コスト)' },
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (高品質)' },
]

export default function AiSettingsPage() {
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [isEnabled, setIsEnabled] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.aiSettings.get()
      if (res.success && res.data) {
        setSettings(res.data)
        setIsEnabled(res.data.isEnabled)
        setSystemPrompt(res.data.systemPrompt ?? '')
        setModel(res.data.model ?? DEFAULT_MODEL)
      }
    } catch {
      setError('設定の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await api.aiSettings.update({
        isEnabled,
        systemPrompt: systemPrompt.trim() || null,
        model,
      })
      if (res.success && res.data) {
        setSettings(res.data)
        setSuccess('設定を保存しました')
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError('保存に失敗しました')
      }
    } catch {
      setError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Header
        title="AI 自動応答設定"
        description="LINE メッセージに Claude AI が自動応答する機能を設定します"
      />

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {success}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ON/OFF トグル */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">AI 自動応答</h2>
                <p className="mt-1 text-sm text-gray-500">
                  キーワードルールに一致しないメッセージを Claude AI が自動返信します。
                  <br />
                  有効化するには環境変数 <code className="bg-gray-100 px-1 rounded text-xs">ANTHROPIC_API_KEY</code> が必要です。
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isEnabled}
                onClick={() => setIsEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                  isEnabled ? 'bg-green-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    isEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {settings && (
              <p className="mt-3 text-xs text-gray-400">
                最終更新: {new Date(settings.updatedAt).toLocaleString('ja-JP')}
              </p>
            )}
          </div>

          {/* モデル選択 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">使用モデル</h2>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* システムプロンプト */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">システムプロンプト</h2>
            <p className="text-sm text-gray-500 mb-3">
              AI の応答スタイルを定義します。空欄の場合は環境変数{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">AI_SYSTEM_PROMPT</code>{' '}
              またはデフォルトプロンプトを使用します。
            </p>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={6}
              placeholder="例: あなたは〇〇のカスタマーサポートです。丁寧な敬語で回答してください。"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
            />
          </div>

          {/* 保存ボタン */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              {saving ? '保存中...' : '設定を保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
