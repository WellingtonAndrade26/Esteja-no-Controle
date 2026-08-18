(function(root){
  function activeInstallments(items=[]){
    return items.filter(i=>Number(i?.paid||0)<Number(i?.installments||0));
  }
  function monthlyInstallmentCommitment(items=[]){
    return activeInstallments(items).reduce((sum,i)=>sum+Number(i?.installmentValue||0),0);
  }
  function outstandingInstallmentBalance(items=[]){
    return activeInstallments(items).reduce((sum,i)=>{
      const remaining=Math.max(0,Number(i?.installments||0)-Number(i?.paid||0));
      return sum+remaining*Number(i?.installmentValue||0);
    },0);
  }
  function purchaseDecision({amount=0,projectedBalance=0,savingsTarget=0}={}){
    const value=Math.max(0,Number(amount||0));
    const projected=Number(projectedBalance||0);
    const target=Math.max(0,Number(savingsTarget||0));
    const after=projected-value;
    const optional=Math.max(0,projected-target);
    let status='fits';
    if(after<0)status='does_not_fit';
    else if(after<target)status='hurts_savings_goal';
    return {amount:value,projectedBefore:projected,projectedAfter:after,savingsTarget:target,availableForOptionalSpending:optional,remainingAboveSavingsTarget:after-target,status};
  }
  const api={activeInstallments,monthlyInstallmentCommitment,outstandingInstallmentBalance,purchaseDecision};
  root.ENCFinanceCore=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
